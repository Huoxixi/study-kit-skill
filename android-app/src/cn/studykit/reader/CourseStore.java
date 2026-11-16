package cn.studykit.reader;

import android.content.Context;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.database.Cursor;
import android.util.AtomicFile;
import org.json.*;
import java.io.*;
import java.nio.ByteBuffer;
import java.nio.charset.*;
import java.security.MessageDigest;
import java.util.*;
import java.util.regex.*;

final class CourseStore {
    static final int MAX_HTML = 20 * 1024 * 1024;
    static final int MAX_BACKUP = 40 * 1024 * 1024;
    private final File root;
    private final Context context;

    CourseStore(Context context) { this.context=context.getApplicationContext(); root=new File(context.getFilesDir(),"courses"); root.mkdirs(); }

    static final class Incoming {
        String html,title,originalTitle,identity,filename,sha,id,backupSubject;
        Boolean backupPinned;
        JSONObject state;
    }

    File dir(String id) {
        if (id==null || !id.matches("[a-f0-9]{32}")) throw new IllegalArgumentException("资料编号无效");
        return new File(root,id);
    }

    JSONArray list() {
        ArrayList<JSONObject> rows=new ArrayList<>();
        File[] dirs=root.listFiles();
        if(dirs!=null) for(File dir:dirs) {
            try { if(dir.isDirectory() && dir.getName().matches("[a-f0-9]{32}") && new File(dir,"index.html").isFile()) rows.add(readJson(new File(dir,"meta.json"))); } catch(Exception ignored) { }
        }
        Collections.sort(rows,(a,b)->Long.compare(b.optLong("opened",b.optLong("updated")),a.optLong("opened",a.optLong("updated"))));
        return new JSONArray(rows);
    }

    JSONObject find(String identity) {
        JSONArray rows=list();
        for(int i=0;i<rows.length();i++) {JSONObject row=rows.optJSONObject(i);if(identity.equals(row.optString("identity"))) return row;}
        return null;
    }

    Incoming read(Uri uri) throws Exception {
        String name="复习资料.html";
        try(Cursor cursor=context.getContentResolver().query(uri,new String[]{OpenableColumns.DISPLAY_NAME},null,null,null)) {
            if(cursor!=null && cursor.moveToFirst()) name=cursor.getString(0);
        } catch(Exception ignored) { }
        try(InputStream in=context.getContentResolver().openInputStream(uri)) {return parse(readBytes(in,MAX_BACKUP),name);}
        catch(Exception error){throw new IOException(name+"："+(error.getMessage()==null?"无法读取":error.getMessage()));}
    }

    Incoming parse(byte[] data,String filename) throws Exception {
        if(data.length==0) throw new IOException("文件是空的，请重新选择工坊生成的 HTML。");
        String text=decode(data);
        Incoming item=new Incoming(); item.filename=filename==null?"复习资料.html":filename;
        if(text.trim().startsWith("{")) {
            JSONObject backup;
            try {backup=new JSONObject(text);}catch(JSONException e){throw new IOException("这个 JSON 不是有效的资料备份。");}
            if(!"study-kit-backup".equals(backup.optString("format")) || backup.optInt("version")!=1) throw new IOException("请选择 HTML，或本 APP 导出的“资料与进度”备份。");
            item.html=backup.getString("html"); item.state=backup.getJSONObject("storage");
            if(item.state.toString().length()>8*1024*1024) throw new IOException("备份中的学习记录过大。");
            item.id=backup.optString("courseId"); if(!item.id.matches("[a-f0-9]{32}"))item.id=null;
            item.title=backup.optString("title","");
            if(backup.has("filename"))item.filename=backup.optString("filename",item.filename);
            if(backup.has("subject"))item.backupSubject=backup.optString("subject");
            if(backup.has("pinned"))item.backupPinned=backup.optBoolean("pinned");
        } else item.html=text;
        if(item.html.getBytes(StandardCharsets.UTF_8).length>MAX_HTML) throw new IOException("HTML 超过 20 MB，请使用独立的复习网页文件。");
        if(!Pattern.compile("<(?:!doctype\\s+html|html|head|body|title|main|section|article|h[1-6]|p|div|table|style|script|form|ul|ol|button|details|meta|svg|canvas|input|link|span|a)\\b",Pattern.CASE_INSENSITIVE).matcher(item.html).find()) throw new IOException("没有识别到网页内容。请选择 .html / .htm 文件。");
        Matcher title=Pattern.compile("<title[^>]*>([\\s\\S]*?)</title>",Pattern.CASE_INSENSITIVE).matcher(item.html);
        String original=title.find()?unescape(title.group(1).replaceAll("<[^>]+>","")).replaceAll("\\s+"," ").trim():item.filename.replaceFirst("(?i)\\.html?$","");
        item.originalTitle=original.isEmpty()?"未命名资料":original;
        if(item.originalTitle.length()>160)item.originalTitle=item.originalTitle.substring(0,160);
        if(item.title==null||item.title.isEmpty())item.title=item.originalTitle;
        if(item.title.isEmpty())item.title="未命名资料";
        if(item.title.length()>160)item.title=item.title.substring(0,160);
        item.identity="title:"+item.originalTitle;
        Matcher tags=Pattern.compile("<meta\\b[^>]*>",Pattern.CASE_INSENSITIVE).matcher(item.html);
        while(tags.find()){String tag=tags.group();if(Pattern.compile("\\bname\\s*=\\s*['\"]study-kit-course-id['\"]",Pattern.CASE_INSENSITIVE).matcher(tag).find()){Matcher value=Pattern.compile("\\bcontent\\s*=\\s*['\"]([^'\"]+)['\"]",Pattern.CASE_INSENSITIVE).matcher(tag);if(value.find()){item.identity="course:"+value.group(1);break;}}}
        item.sha=hex(MessageDigest.getInstance("SHA-256").digest(item.html.getBytes(StandardCharsets.UTF_8)));
        return item;
    }

    JSONObject save(Incoming item,JSONObject existing,boolean separate) throws Exception {
        return save(item,existing,separate,"");
    }
    JSONObject save(Incoming item,JSONObject existing,boolean separate,String subject) throws Exception {
        String id=existing!=null&&!separate?existing.getString("id"):item.id;
        if(id==null || (existing==null && dir(id).exists()) || separate)id=UUID.randomUUID().toString().replace("-","");
        File dir=dir(id); boolean fresh=!new File(dir,"meta.json").isFile();dir.mkdirs();
        JSONObject meta=new JSONObject();
        String label=existing!=null&&item.state==null?existing.optString("title",item.title):item.title;
        String group=item.backupSubject!=null?cleanGroup(item.backupSubject):existing!=null?existing.optString("subject"):subject;
        if(!group.isEmpty())addGroup(group);
        meta.put("id",id).put("title",label).put("originalTitle",item.originalTitle).put("identity",item.identity).put("subject",group).put("pinned",item.backupPinned!=null?item.backupPinned:existing!=null&&existing.optBoolean("pinned")).put("filename",item.filename).put("sha256",item.sha).put("created",existing==null?System.currentTimeMillis():existing.optLong("created",existing.optLong("updated"))).put("updated",System.currentTimeMillis()).put("opened",existing==null?0:existing.optLong("opened"));
        atomic(new File(dir,"index.html"),item.html.getBytes(StandardCharsets.UTF_8));
        if(item.state!=null) atomic(new File(dir,"restore.json"),item.state.toString().getBytes(StandardCharsets.UTF_8));
        else if(fresh)atomic(new File(dir,"restore.json"),"{}".getBytes(StandardCharsets.UTF_8));
        atomic(new File(dir,"meta.json"),meta.toString().getBytes(StandardCharsets.UTF_8));
        return meta;
    }

    void rename(String id,String name) throws Exception {JSONObject row=meta(id);row.put("title",name);atomic(new File(dir(id),"meta.json"),row.toString().getBytes(StandardCharsets.UTF_8));}
    JSONObject meta(String id) throws Exception {JSONObject row=readJson(new File(dir(id),"meta.json"));if(!row.has("subject"))row.put("subject","");if(!row.has("pinned"))row.put("pinned",false);if(!row.has("created"))row.put("created",row.optLong("updated"));return row;}
    void opened(String id) throws Exception {JSONObject row=meta(id);row.put("opened",System.currentTimeMillis());atomic(new File(dir(id),"meta.json"),row.toString().getBytes(StandardCharsets.UTF_8));}
    void delete(String id) throws IOException {File dir=dir(id);File[] files=dir.listFiles();if(files!=null)for(File file:files)if(!file.delete())throw new IOException("删除未完成，请重试。");if(!dir.delete())throw new IOException("删除未完成，请重试。");}
    static JSONObject readJson(File file) throws Exception {try(InputStream in=new FileInputStream(file)){return new JSONObject(decode(readBytes(in,MAX_BACKUP)));}}
    static byte[] readBytes(InputStream in,int max) throws IOException {if(in==null)throw new IOException("无法打开文件，请先保存到手机后再导入。");ByteArrayOutputStream out=new ByteArrayOutputStream();byte[] buf=new byte[16384];int n;while((n=in.read(buf))!=-1){if(out.size()+n>max)throw new IOException("文件过大，请选择 20 MB 以内的 HTML 或本 APP 备份。");out.write(buf,0,n);}return out.toByteArray();}
    static String decode(byte[] bytes) throws IOException {
        try {
            if(bytes.length>=2&&((bytes[0]&255)==255&&(bytes[1]&255)==254||(bytes[0]&255)==254&&(bytes[1]&255)==255))return strict(bytes,StandardCharsets.UTF_16);
            try{String s=strict(bytes,StandardCharsets.UTF_8);return s.startsWith("\uFEFF")?s.substring(1):s;}
            catch(CharacterCodingException e){
                String prefix=new String(bytes,0,Math.min(bytes.length,8192),StandardCharsets.ISO_8859_1);
                Matcher tags=Pattern.compile("<meta\\b[^>]*>",Pattern.CASE_INSENSITIVE).matcher(prefix);
                while(tags.find()){Matcher charset=Pattern.compile("charset\\s*=\\s*['\"]?\\s*([a-zA-Z0-9._-]+)",Pattern.CASE_INSENSITIVE).matcher(tags.group());if(charset.find()&&Charset.isSupported(charset.group(1)))return strict(bytes,Charset.forName(charset.group(1)));}
                throw e;
            }
        }catch(Exception e){throw new IOException("网页编码无法识别，请保存为 UTF-8、UTF-16，或声明正确字符集后重试。");}
    }
    private static String strict(byte[] bytes,Charset charset) throws CharacterCodingException{return charset.newDecoder().onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes)).toString();}

    JSONObject exact(Incoming item,String subject){JSONArray rows=list();for(int i=0;i<rows.length();i++){JSONObject row=rows.optJSONObject(i);if(subject.equals(row.optString("subject"))&&item.sha.equals(row.optString("sha256")))return row;}return null;}
    JSONObject related(Incoming item,String subject){
        if(item.state!=null&&item.id!=null){try{return meta(item.id);}catch(Exception ignored){}}
        JSONArray rows=list();JSONObject candidate=null;
        for(int i=0;i<rows.length();i++){JSONObject row=rows.optJSONObject(i);if(subject.equals(row.optString("subject"))&&item.identity.equals(row.optString("identity"))){if(candidate!=null)return null;candidate=row;}}
        return candidate;
    }
    private void writeMeta(JSONObject row) throws Exception{atomic(new File(dir(row.getString("id")),"meta.json"),row.toString().getBytes(StandardCharsets.UTF_8));}
    void pin(String id) throws Exception{JSONObject row=meta(id);row.put("pinned",!row.optBoolean("pinned"));writeMeta(row);}
    ArrayList<String> groups(){
        HashSet<String> names=new HashSet<>();
        try{JSONArray values=readJson(new File(root,"library.json")).optJSONArray("subjects");if(values!=null)for(int i=0;i<values.length();i++)if(!values.optString(i).isEmpty())names.add(values.optString(i));}catch(Exception ignored){}
        JSONArray rows=list();for(int i=0;i<rows.length();i++){String group=rows.optJSONObject(i).optString("subject");if(!group.isEmpty())names.add(group);}
        ArrayList<String> result=new ArrayList<>(names);Collections.sort(result,java.text.Collator.getInstance(Locale.CHINA));return result;
    }
    private void writeGroups(Collection<String> names) throws Exception{atomic(new File(root,"library.json"),new JSONObject().put("subjects",new JSONArray(names)).toString().getBytes(StandardCharsets.UTF_8));}
    static String cleanGroup(String name){String value=name==null?"":name.replace('\u3000',' ').replaceAll("\\s+"," ").trim();return value.length()>60?value.substring(0,60):value;}
    void addGroup(String name) throws Exception{String group=cleanGroup(name);if(group.isEmpty()||!group.equals(name)||Arrays.asList("全部课程","未分类").contains(group))throw new IOException("课程名需为 1—60 个字，且不能叫“全部课程”或“未分类”。");ArrayList<String> names=groups();if(!names.contains(group)){names.add(group);writeGroups(names);}}
    void setGroup(Collection<String> ids,String group) throws Exception{if(!group.isEmpty())addGroup(group);for(String id:ids){JSONObject row=meta(id);row.put("subject",group);writeMeta(row);}}
    void renameGroup(String oldName,String newName) throws Exception{
        if(oldName.equals(newName))return;if(groups().contains(newName))throw new IOException("已有同名课程，请换一个名称。");addGroup(newName);
        JSONArray rows=list();for(int i=0;i<rows.length();i++){JSONObject row=rows.optJSONObject(i);if(oldName.equals(row.optString("subject"))){row.put("subject",newName);writeMeta(row);}}
        ArrayList<String> names=groups();names.remove(oldName);writeGroups(names);
    }
    void deleteGroup(String name) throws Exception{JSONArray rows=list();for(int i=0;i<rows.length();i++){JSONObject row=rows.optJSONObject(i);if(name.equals(row.optString("subject"))){row.put("subject","");writeMeta(row);}}ArrayList<String> names=groups();names.remove(name);writeGroups(names);}
    static void atomic(File file,byte[] bytes) throws IOException {AtomicFile atomic=new AtomicFile(file);FileOutputStream out=null;try{out=atomic.startWrite();out.write(bytes);atomic.finishWrite(out);}catch(IOException e){if(out!=null)atomic.failWrite(out);throw e;}}
    static String hex(byte[] bytes){StringBuilder out=new StringBuilder();for(byte b:bytes)out.append(String.format(Locale.ROOT,"%02x",b&255));return out.toString();}
    static String unescape(String text){return android.text.Html.fromHtml(text,android.text.Html.FROM_HTML_MODE_LEGACY).toString();}
}
