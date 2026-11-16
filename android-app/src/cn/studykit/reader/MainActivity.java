package cn.studykit.reader;

import android.app.*;
import android.content.*;
import android.net.Uri;
import android.os.*;
import android.text.*;
import android.view.*;
import android.widget.*;
import org.json.*;
import java.io.*;
import java.text.*;
import java.util.*;
import java.util.concurrent.*;

public final class MainActivity extends Activity {
    private static final int PICK = 10, UPDATE = 11;
    private CourseStore store;
    private Ui ui;
    private TextView status;
    private Button importer, coursesButton;
    private EditText search;
    private Spinner courseFilter, sortFilter;
    private LinearLayout results;
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private final ArrayDeque<Reader> queue = new ArrayDeque<>();
    private final ArrayList<String> importedIds = new ArrayList<>(), errors = new ArrayList<>();
    private ArrayList<String> groupValues;
    private JSONArray allRows;
    private boolean busy;
    private String selectedGroup, query = "", pendingUpdateId, forcedTarget, batchGroup;
    private int sortMode, total, added, updated, duplicate, skipped;
    private JSONObject lastSuccess;

    interface Reader { CourseStore.Incoming read() throws Exception; }
    interface Mutation { void run() throws Exception; }

    @Override public void onCreate(Bundle state) {
        super.onCreate(state); store = new CourseStore(this);
        if (state != null) { selectedGroup = state.getString("group"); query = state.getString("query", ""); sortMode = state.getInt("sort"); pendingUpdateId = state.getString("update"); }
        render(); if (state == null) handleIntent(getIntent());
        if (Build.VERSION.SDK_INT >= 33) getOnBackInvokedDispatcher().registerOnBackInvokedCallback(android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT, () -> handleBack());
    }
    @Override public void onResume() { super.onResume(); if (!busy) render(); }
    @Override protected void onNewIntent(Intent intent) { super.onNewIntent(intent); setIntent(intent); handleIntent(intent); }
    @Override protected void onSaveInstanceState(Bundle state) {
        super.onSaveInstanceState(state); state.putString("group", selectedGroup); state.putString("query", query); state.putInt("sort", sortMode); state.putString("update", pendingUpdateId);
    }
    private void post(Runnable action) { runOnUiThread(() -> { if (!isFinishing() && !isDestroyed()) action.run(); }); }
    private void handleIntent(Intent intent) {
        if (intent == null || busy) return;
        ArrayList<Uri> uris = new ArrayList<>();
        if (Intent.ACTION_SEND_MULTIPLE.equals(intent.getAction())) {
            ArrayList<Uri> shared = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM); if (shared != null) uris.addAll(shared);
        } else {
            Uri uri = Intent.ACTION_SEND.equals(intent.getAction()) ? intent.getParcelableExtra(Intent.EXTRA_STREAM) : Intent.ACTION_VIEW.equals(intent.getAction()) ? intent.getData() : null;
            if (uri != null) uris.add(uri);
        }
        if (!uris.isEmpty()) beginUris(uris, null);
    }
    private void choose(String updateId) {
        if (busy) return;
        pendingUpdateId = updateId;
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*");
        intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, updateId == null);
        try { startActivityForResult(intent, updateId == null ? PICK : UPDATE); }
        catch (ActivityNotFoundException e) { pendingUpdateId = null; ui.error("请先启用手机的系统文件选择器。"); }
    }
    @Override public void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request != PICK && request != UPDATE) return;
        String target = request == UPDATE ? pendingUpdateId : null; pendingUpdateId = null;
        if (result != RESULT_OK || data == null) return;
        LinkedHashSet<Uri> unique = new LinkedHashSet<>();
        if (data.getClipData() != null) for (int i = 0; i < data.getClipData().getItemCount(); i++) unique.add(data.getClipData().getItemAt(i).getUri());
        else if (data.getData() != null) unique.add(data.getData());
        if (target != null && unique.size() != 1) { ui.error("更新一份资料时，请只选择一个 HTML。"); return; }
        beginUris(new ArrayList<>(unique), target);
    }
    private void beginUris(ArrayList<Uri> uris, String target) {
        if (uris.isEmpty()) return;
        if (uris.size() > 100) { ui.error("一次最多导入 100 份资料，请分批选择。"); return; }
        ArrayList<Reader> readers = new ArrayList<>(); for (Uri uri : uris) readers.add(() -> store.read(uri));
        begin(readers, target);
    }
    private void sample() {
        ArrayList<Reader> readers = new ArrayList<>();
        readers.add(() -> { try (InputStream in = getAssets().open("sample.html")) { return store.parse(CourseStore.readBytes(in, CourseStore.MAX_HTML), "人工智能四级.html"); } });
        begin(readers, null);
    }
    private void begin(Collection<Reader> readers, String target) {
        if (busy) return;
        queue.clear(); queue.addAll(readers); total = readers.size(); forcedTarget = target;
        batchGroup = selectedGroup == null ? "" : selectedGroup;
        added = updated = duplicate = skipped = 0; importedIds.clear(); errors.clear(); lastSuccess = null;
        busy = true; importer.setEnabled(false); coursesButton.setEnabled(false); courseFilter.setEnabled(false);
        next();
    }
    private void next() {
        if (queue.isEmpty()) { finishImport(); return; }
        status.setText("正在导入 " + (total - queue.size() + 1) + " / " + total + "…");
        Reader reader = queue.removeFirst();
        io.execute(() -> {
            try {
                CourseStore.Incoming item = reader.read();
                if (forcedTarget != null && item.state != null) throw new IOException("更新资料请选择 HTML。恢复资料备份请从资料库的“导入 HTML”进入。");
                JSONObject target = forcedTarget == null ? null : store.meta(forcedTarget);
                String group = item.backupSubject == null ? batchGroup : item.backupSubject;
                JSONObject exact = item.state == null ? store.exact(item, group) : null;
                JSONObject related = store.related(item, group);
                post(() -> decide(item, target, exact, related));
            } catch (Exception e) { post(() -> { errors.add(e.getMessage() == null ? "文件读取失败" : e.getMessage()); next(); }); }
        });
    }
    private void decide(CourseStore.Incoming item, JSONObject target, JSONObject exact, JSONObject related) {
        if (target != null) { commit(item, target, false); return; }
        if (exact != null) {
            if (total > 1) { duplicate++; lastSuccess = exact; next(); return; }
            new AlertDialog.Builder(this).setTitle("这份资料已经导入")
                .setMessage("“" + exact.optString("title") + "”已有一份。另存一份会分别记录学习进度。")
                .setPositiveButton("打开已有", (d, w) -> { duplicate++; lastSuccess = exact; next(); })
                .setNeutralButton("另存一份", (d, w) -> commit(item, null, true))
                .setNegativeButton("取消", (d, w) -> skip()).setOnCancelListener(d -> skip()).show();
            return;
        }
        if (related != null && item.state != null) {
            new AlertDialog.Builder(this).setTitle("恢复资料与进度？")
                .setMessage("恢复“" + related.optString("title") + "”会替换这份资料的当前学习记录。其他课程不受影响。")
                .setPositiveButton("恢复备份", (d, w) -> commit(item, related, false))
                .setNeutralButton("另存一份", (d, w) -> commit(item, null, true))
                .setNegativeButton("取消", (d, w) -> skip()).setOnCancelListener(d -> skip()).show();
            return;
        }
        if (related != null && total == 1) {
            new AlertDialog.Builder(this).setTitle("发现同名资料")
                .setMessage("标题相同的 HTML 也可能属于不同课程。请选择新增一份，或更新“" + related.optString("title") + "”并保留它的进度。")
                .setPositiveButton("作为新资料", (d, w) -> commit(item, null, true))
                .setNeutralButton("更新已有资料", (d, w) -> commit(item, related, false))
                .setNegativeButton("取消", (d, w) -> skip()).setOnCancelListener(d -> skip()).show();
            return;
        }
        commit(item, null, false);
    }
    private void skip() { skipped++; next(); }
    private void commit(CourseStore.Incoming item, JSONObject existing, boolean separate) {
        io.execute(() -> {
            try {
                JSONObject row = store.save(item, existing, separate, batchGroup);
                post(() -> { if (existing != null && !separate) updated++; else added++; if (!importedIds.contains(row.optString("id"))) importedIds.add(row.optString("id")); lastSuccess = row; next(); });
            } catch (Exception e) { post(() -> { errors.add(item.filename + "：" + (e.getMessage() == null ? "保存失败" : e.getMessage())); next(); }); }
        });
    }
    private void finishImport() {
        busy = false;
        if (total == 1 && lastSuccess != null) { query = ""; if (selectedGroup != null || forcedTarget != null) selectedGroup = lastSuccess.optString("subject"); }
        forcedTarget = null; render();
        if (total == 1 && errors.isEmpty() && lastSuccess != null) { open(lastSuccess); return; }
        if (total == 1 && errors.isEmpty()) return;
        String message = "新增 " + added + " 份，更新 " + updated + " 份，重复 " + duplicate + " 份，跳过 " + skipped + " 份。";
        if (!errors.isEmpty()) { message += "\n\n未完成 " + errors.size() + " 份："; for (int i = 0; i < Math.min(5, errors.size()); i++) message += "\n" + errors.get(i); message += "\n其他成功导入的资料已保留。"; }
        AlertDialog.Builder dialog = new AlertDialog.Builder(this).setTitle(errors.isEmpty() ? "导入完成" : "导入结果").setMessage(message).setPositiveButton("完成", null);
        if (!importedIds.isEmpty()) { ArrayList<String> ids = new ArrayList<>(importedIds); dialog.setNeutralButton("归入课程", (d, w) -> assignGroup(ids)); }
        dialog.show();
    }
    private void open(JSONObject row) { startActivity(new Intent(this, StudyActivity.class).putExtra("course", row.optString("id"))); }

    private void render() {
        ui = new Ui(this); allRows = store.list();
        if (selectedGroup != null && !selectedGroup.isEmpty() && !store.groups().contains(selectedGroup)) selectedGroup = null;
        LinearLayout root = ui.root();
        LinearLayout bar = new LinearLayout(this); bar.setGravity(Gravity.CENTER_VERTICAL); bar.setPadding(ui.dp(24), ui.dp(16), ui.dp(16), ui.dp(8));
        bar.addView(ui.text("复习工坊", 24, ui.ink, true), new LinearLayout.LayoutParams(0, -2, 1));
        coursesButton = ui.button("课程管理", false); coursesButton.setContentDescription("课程管理"); coursesButton.setEnabled(!busy); coursesButton.setOnClickListener(v -> manageGroups()); bar.addView(coursesButton); root.addView(bar);
        LinearLayout tools = ui.column(); tools.setPadding(ui.dp(24), 0, ui.dp(24), ui.dp(10));
        status = ui.text("", 14, ui.muted, false); tools.addView(status); ui.gap(tools, 10);
        search = new EditText(this); search.setSingleLine(true); search.setTextSize(16); search.setTextColor(ui.ink); search.setHintTextColor(ui.muted); search.setBackgroundTintList(new android.content.res.ColorStateList(new int[][]{new int[]{android.R.attr.state_focused}, new int[]{}}, new int[]{ui.primary, ui.muted})); search.setHint("搜索资料名称或文件名"); search.setContentDescription("搜索资料"); search.setText(query); tools.addView(search, ui.match());
        LinearLayout filters = new LinearLayout(this); filters.setGravity(Gravity.CENTER_VERTICAL);
        groupValues = new ArrayList<>(); groupValues.add(null); groupValues.add(""); groupValues.addAll(store.groups());
        ArrayList<String> labels = new ArrayList<>(); labels.add("全部课程"); labels.add("未分类"); labels.addAll(store.groups());
        courseFilter = new Spinner(this); courseFilter.setBackgroundTintList(android.content.res.ColorStateList.valueOf(ui.muted)); courseFilter.setContentDescription("课程筛选"); courseFilter.setAdapter(adapter(labels)); courseFilter.setSelection(Math.max(0, groupValues.indexOf(selectedGroup))); courseFilter.setEnabled(!busy); filters.addView(courseFilter, new LinearLayout.LayoutParams(0, ui.dp(48), 1));
        sortFilter = new Spinner(this); sortFilter.setBackgroundTintList(android.content.res.ColorStateList.valueOf(ui.muted)); sortFilter.setContentDescription("资料排序"); sortFilter.setAdapter(adapter(Arrays.asList("最近学习", "最近导入", "名称排序"))); sortFilter.setSelection(sortMode); filters.addView(sortFilter, new LinearLayout.LayoutParams(ui.dp(164), ui.dp(48)));
        tools.addView(filters); root.addView(tools);
        ScrollView scroll = new ScrollView(this); scroll.setFillViewport(true); results = ui.column(); results.setPadding(ui.dp(24), 0, ui.dp(24), ui.dp(16)); scroll.addView(results); root.addView(scroll, new LinearLayout.LayoutParams(-1, 0, 1));
        LinearLayout bottom = ui.column(); bottom.setPadding(ui.dp(24), ui.dp(8), ui.dp(24), ui.dp(14));
        importer = ui.button("导入 HTML", true); importer.setContentDescription("导入 HTML"); importer.setEnabled(!busy); importer.setOnClickListener(v -> choose(null)); bottom.addView(importer, ui.match());
        TextView hint = ui.text("可多选 HTML / HTM，也可恢复资料备份", 12, ui.muted, false); hint.setGravity(Gravity.CENTER); bottom.addView(hint); root.addView(bottom); setContentView(root); root.setFocusableInTouchMode(true); root.requestFocus();
        search.addTextChangedListener(new TextWatcher() { public void beforeTextChanged(CharSequence s, int start, int count, int after) { } public void onTextChanged(CharSequence s, int start, int before, int count) { query = s.toString(); renderRows(); } public void afterTextChanged(Editable value) { } });
        courseFilter.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() { public void onItemSelected(AdapterView<?> parent, View view, int position, long id) { selectedGroup = groupValues.get(position); renderRows(); } public void onNothingSelected(AdapterView<?> parent) { } });
        sortFilter.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() { public void onItemSelected(AdapterView<?> parent, View view, int position, long id) { sortMode = position; renderRows(); } public void onNothingSelected(AdapterView<?> parent) { } });
        renderRows();
    }
    private ArrayAdapter<String> adapter(List<String> values) {
        ArrayAdapter<String> adapter = new ArrayAdapter<String>(this, android.R.layout.simple_spinner_item, values) {
            @Override public View getView(int position, View convert, android.view.ViewGroup parent) { View view = super.getView(position, convert, parent); if (view instanceof TextView) ((TextView) view).setTextColor(ui.ink); return view; }
            @Override public View getDropDownView(int position, View convert, android.view.ViewGroup parent) { View view = super.getDropDownView(position, convert, parent); view.setBackgroundColor(ui.paper); view.setMinimumHeight(ui.dp(48)); if (view instanceof TextView) ((TextView) view).setTextColor(ui.ink); return view; }
        };
        adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item); return adapter;
    }
    private void renderRows() {
        if (results == null) return;
        results.removeAllViews(); ArrayList<JSONObject> filtered = new ArrayList<>(); String needle = query.trim().toLowerCase(Locale.ROOT);
        for (int i = 0; i < allRows.length(); i++) {
            JSONObject row = allRows.optJSONObject(i);
            if (selectedGroup != null && !selectedGroup.equals(row.optString("subject"))) continue;
            String haystack = row.optString("title") + " " + row.optString("filename") + " " + row.optString("subject");
            if (!needle.isEmpty() && !haystack.toLowerCase(Locale.ROOT).contains(needle)) continue;
            filtered.add(row);
        }
        final Collator collator = Collator.getInstance(Locale.CHINA);
        Collections.sort(filtered, (a, b) -> { int pinned = Boolean.compare(b.optBoolean("pinned"), a.optBoolean("pinned")); if (pinned != 0) return pinned; if (sortMode == 2) return collator.compare(a.optString("title"), b.optString("title")); String key = sortMode == 1 ? "created" : "opened"; return Long.compare(b.optLong(key, b.optLong("updated")), a.optLong(key, a.optLong("updated"))); });
        if (!busy) status.setText((selectedGroup == null ? "全部课程" : selectedGroup.isEmpty() ? "未分类" : selectedGroup) + " · " + filtered.size() + " 份资料" + (!needle.isEmpty() ? "（搜索结果）" : ""));
        if (filtered.isEmpty()) {
            LinearLayout empty = ui.column(); empty.setPadding(ui.dp(6), ui.dp(32), ui.dp(6), ui.dp(20));
            String title = allRows.length() == 0 ? "把每门课，放进自己的资料库" : !needle.isEmpty() ? "没有找到匹配的资料" : "这门课程还没有资料";
            empty.addView(ui.text(title, 22, ui.ink, true)); ui.gap(empty, 14);
            empty.addView(ui.text(allRows.length() == 0 ? "可以先新建课程，再一次导入多个章节。卡片、题目和进度分别保存，断网也能继续学。" : !needle.isEmpty() ? "试试其他关键词，或切换到“全部课程”。" : "点下方“导入 HTML”，新资料会直接归入当前课程。", 16, ui.muted, false));
            ui.gap(empty, 20); Button action = ui.button(allRows.length() == 0 ? "用示例资料试一试" : "清除筛选", false); action.setOnClickListener(v -> { if (allRows.length() == 0) sample(); else { query = ""; selectedGroup = null; render(); } }); empty.addView(action, ui.match()); results.addView(empty); return;
        }
        for (JSONObject row : filtered) {
            LinearLayout card = ui.column(); card.setPadding(ui.dp(18), ui.dp(14), ui.dp(12), ui.dp(12)); card.setBackground(ui.surface(ui.paper, 16, true));
            LinearLayout heading = new LinearLayout(this); heading.setGravity(Gravity.CENTER_VERTICAL);
            TextView title = ui.text(row.optString("title"), 19, ui.ink, true); heading.addView(title, new LinearLayout.LayoutParams(0, -2, 1));
            Button more = ui.button("管理", false); more.setContentDescription("管理资料：" + row.optString("title")); more.setOnClickListener(v -> { if (!busy) manage(row, more); }); heading.addView(more); card.addView(heading);
            String group = row.optString("subject"); String label = (row.optBoolean("pinned") ? "已置顶 · " : "") + (group.isEmpty() ? "未分类" : group) + " · " + row.optString("filename");
            TextView details = ui.text(label, 12, ui.muted, false); details.setMaxLines(2); details.setEllipsize(TextUtils.TruncateAt.END); card.addView(details); ui.gap(card, 7);
            long opened = row.optLong("opened"); card.addView(ui.text(opened == 0 ? "已导入 · 可离线使用" : "上次学习 " + new SimpleDateFormat("MM月dd日 HH:mm", Locale.CHINA).format(new Date(opened)), 12, ui.muted, false)); ui.gap(card, 10);
            Button start = ui.button(opened == 0 ? "打开资料" : "继续学习", true); start.setContentDescription("打开资料：" + row.optString("title")); start.setOnClickListener(v -> open(row)); card.addView(start, ui.match()); results.addView(card, ui.match()); ui.gap(results, 12);
        }
    }

    private void change(Mutation mutation) { try { mutation.run(); render(); } catch (Exception e) { ui.error(e.getMessage() == null ? "未能保存，请重试。" : e.getMessage()); } }
    private void nameDialog(String heading, String initial, java.util.function.Consumer<String> accept) {
        EditText input = new EditText(this); input.setSingleLine(true); input.setText(initial); input.setSelectAllOnFocus(true); input.setPadding(ui.dp(24), ui.dp(12), ui.dp(24), ui.dp(12));
        AlertDialog dialog = new AlertDialog.Builder(this).setTitle(heading).setView(input).setPositiveButton("保存", null).setNegativeButton("取消", null).create();
        dialog.setOnShowListener(d -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> { String value = input.getText().toString().replace('\u3000', ' ').trim(); if (value.isEmpty() || value.length() > (heading.contains("课程") ? 60 : 160)) { input.setError("名称不能为空或过长"); return; } dialog.dismiss(); accept.accept(value); })); dialog.show();
    }
    private void manage(JSONObject row, View anchor) {
        PopupMenu menu = new PopupMenu(this, anchor);
        for (String action : Arrays.asList("设置课程", "重命名", row.optBoolean("pinned") ? "取消置顶" : "置顶", "更新 HTML", "删除资料")) menu.getMenu().add(action);
        menu.setOnMenuItemClickListener(item -> {
            String action = item.getTitle().toString(), id = row.optString("id");
            if (action.equals("设置课程")) assignGroup(Collections.singletonList(id));
            else if (action.equals("重命名")) nameDialog("重命名资料", row.optString("title"), value -> change(() -> store.rename(id, value)));
            else if (action.equals("置顶") || action.equals("取消置顶")) change(() -> store.pin(id));
            else if (action.equals("更新 HTML")) choose(id);
            else new AlertDialog.Builder(this).setTitle("删除这份资料？").setMessage("“" + row.optString("title") + "”及它的进度将移除，其他资料不会受到影响。可先打开资料导出备份。")
                .setPositiveButton("删除", (d, w) -> change(() -> store.delete(id))).setNegativeButton("取消", null).show();
            return true;
        }); menu.show();
    }
    private void assignGroup(Collection<String> ids) {
        ArrayList<String> groups = store.groups(); ArrayList<String> choices = new ArrayList<>(); choices.add("未分类"); choices.addAll(groups); choices.add("新建课程…");
        new AlertDialog.Builder(this).setTitle("归入哪门课程？").setItems(choices.toArray(new String[0]), (d, index) -> {
            if (index == choices.size() - 1) nameDialog("新建课程", "", name -> change(() -> { store.setGroup(ids, name); selectedGroup = name; query = ""; }));
            else change(() -> { String group = index == 0 ? "" : groups.get(index - 1); store.setGroup(ids, group); selectedGroup = group; query = ""; });
        }).setNegativeButton("取消", null).show();
    }
    private void manageGroups() {
        if (busy) return;
        ArrayList<String> groups = store.groups(); ArrayList<String> choices = new ArrayList<>(); choices.add("新建课程");
        for (String group : groups) { int count = 0; JSONArray rows = store.list(); for (int i = 0; i < rows.length(); i++) if (group.equals(rows.optJSONObject(i).optString("subject"))) count++; choices.add(group + "（" + count + " 份资料）"); }
        new AlertDialog.Builder(this).setTitle("课程管理").setItems(choices.toArray(new String[0]), (d, index) -> {
            if (index == 0) nameDialog("新建课程", "", name -> change(() -> { store.addGroup(name); selectedGroup = name; }));
            else courseActions(groups.get(index - 1));
        }).setNeutralButton("使用说明", (d, w) -> help()).setNegativeButton("关闭", null).show();
    }
    private void courseActions(String group) {
        new AlertDialog.Builder(this).setTitle(group).setItems(new String[]{"查看这门课程", "重命名课程", "移除课程分类"}, (d, index) -> {
            if (index == 0) { selectedGroup = group; query = ""; render(); }
            else if (index == 1) nameDialog("重命名课程", group, name -> change(() -> { store.renameGroup(group, name); if (group.equals(selectedGroup)) selectedGroup = name; }));
            else new AlertDialog.Builder(this).setTitle("移除课程分类？").setMessage("“" + group + "”内的所有 HTML 和学习进度都会保留，只会移到“未分类”。")
                .setPositiveButton("移除分类", (dialog, which) -> change(() -> { store.deleteGroup(group); if (group.equals(selectedGroup)) selectedGroup = ""; })).setNegativeButton("取消", null).show();
        }).setNegativeButton("取消", null).show();
    }
    private void help() {
        new AlertDialog.Builder(this).setTitle("多课程资料库").setMessage("1. 在“课程管理”中新建课程，例如高数、英语。\n2. 选择课程后点“导入 HTML”，可一次多选章节文件。也可先导入，再通过“管理 → 设置课程”分类。\n3. 搜索、排序或置顶，快速找到要复习的资料。\n4. 每份资料独立保存进度；“管理 → 更新 HTML”可保留原进度和自定名称。\n5. 学习页顶部可导出资料与进度，资料库支持恢复备份。\n\n支持独立 HTML / HTM、常见网页片段和已声明编码的网页，每份最大 20 MB。外部资源和旁边的文件不会自动导入；静态 HTML 仍按它本身的内容展示。卸载前请导出备份。\n\n版本 1.1.0 · 无需账号和服务器。")
            .setPositiveButton("知道了", null).show();
    }
    @Override public void onBackPressed() {
        handleBack();
    }
    private void handleBack() {
        if (!busy) { finish(); return; }
        new AlertDialog.Builder(this).setTitle("停止剩余导入？").setMessage("已经导入的资料会保留，当前文件完成后停止处理剩余文件。")
            .setPositiveButton("停止导入", (d, w) -> { skipped += queue.size(); queue.clear(); }).setNegativeButton("继续导入", null).show();
    }
    @Override protected void onDestroy() { io.shutdown(); super.onDestroy(); }
}
