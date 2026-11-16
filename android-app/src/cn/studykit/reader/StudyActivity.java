package cn.studykit.reader;

import android.app.*;
import android.content.*;
import android.net.Uri;
import android.os.*;
import android.text.TextUtils;
import android.view.*;
import android.webkit.*;
import android.widget.*;
import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;

public final class StudyActivity extends Activity {
    private static final int FILE=20,SAVE=21;
    private static final String EXPORT="study-kit:save-download";
    private CourseStore store;private String id,origin,title,pendingName;private File folder,pendingFile;
    private WebView web;private Ui ui;private ValueCallback<Uri[]> fileCallback;
    private final Handler handler=new Handler(Looper.getMainLooper());
    private String lastState;
    private final Runnable snapshotLoop=new Runnable(){public void run(){snapshot(null);handler.postDelayed(this,3000);}};

    @Override public void onCreate(Bundle state){
        super.onCreate(state);store=new CourseStore(this);
        try{id=getIntent().getStringExtra("course");folder=store.dir(id);JSONObject meta=store.meta(id);title=meta.getString("title");origin="https://c"+id+".study-kit.invalid";store.opened(id);}catch(Exception e){finish();return;}
        pendingFile=new File(getCacheDir(),"pending-export-"+id);if(state!=null)pendingName=state.getString("pendingName");
        ui=new Ui(this);LinearLayout root=ui.root();LinearLayout bar=new LinearLayout(this);bar.setGravity(Gravity.CENTER_VERTICAL);bar.setPadding(ui.dp(8),ui.dp(4),ui.dp(8),ui.dp(4));bar.setBackgroundColor(ui.paper);
        Button home=ui.button("资料库",false);home.setContentDescription("返回资料库");home.setOnClickListener(v->leave());bar.addView(home);
        TextView heading=ui.text(title,15,ui.ink,true);heading.setSingleLine(true);heading.setEllipsize(TextUtils.TruncateAt.END);heading.setPadding(ui.dp(8),0,ui.dp(8),0);bar.addView(heading,new LinearLayout.LayoutParams(0,-2,1));Button more=ui.button("备份",false);more.setContentDescription("资料与学习进度备份");more.setOnClickListener(v->exportBackup());bar.addView(more);root.addView(bar);
        View line=new View(this);line.setBackgroundColor(ui.line);root.addView(line,new LinearLayout.LayoutParams(-1,ui.dp(1)));
        web=new WebView(this);web.setBackgroundColor(ui.paper);root.addView(web,new LinearLayout.LayoutParams(-1,0,1));setContentView(root);
        WebView.setWebContentsDebuggingEnabled((getApplicationInfo().flags&android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE)!=0);
        WebSettings settings=web.getSettings();settings.setJavaScriptEnabled(true);settings.setDomStorageEnabled(true);settings.setAllowFileAccess(false);settings.setAllowContentAccess(true);settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);settings.setJavaScriptCanOpenWindowsAutomatically(false);settings.setSupportMultipleWindows(false);settings.setMediaPlaybackRequiresUserGesture(true);settings.setDefaultTextEncodingName("UTF-8");
        // Each imported course has a separate, stable origin; storage keys can be reused safely.
        web.setWebViewClient(new WebViewClient(){
            @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest request){
                Uri uri=request.getUrl();
                if(isLocal(uri)&&("/index.html".equals(uri.getPath())||"/".equals(uri.getPath()))){
                    try{String html;try(InputStream in=new FileInputStream(new File(folder,"index.html"))){html=CourseStore.decode(CourseStore.readBytes(in,CourseStore.MAX_HTML));}String bootstrap=bootstrap();int at=indexOfIgnoreCase(html,"<head");if(at>=0){at=html.indexOf('>',at);if(at>=0)html=html.substring(0,at+1)+bootstrap+html.substring(at+1);else html=bootstrap+html;}else {java.util.regex.Matcher doc=java.util.regex.Pattern.compile("<!doctype[^>]*>",java.util.regex.Pattern.CASE_INSENSITIVE).matcher(html);int start=doc.find()?doc.end():0;html=html.substring(0,start)+bootstrap+html.substring(start);}WebResourceResponse response=new WebResourceResponse("text/html","UTF-8",new ByteArrayInputStream(html.getBytes(StandardCharsets.UTF_8)));Map<String,String> headers=new HashMap<>();headers.put("Cache-Control","no-store");headers.put("Content-Type","text/html; charset=UTF-8");response.setResponseHeaders(headers);return response;}catch(Exception e){return response(500,"资料读取失败，请返回资料库重新导入。");}
                }
                if("data".equals(uri.getScheme())||"blob".equals(uri.getScheme()))return null;
                return response(403,"此资料资源未包含在独立 HTML 中。请在工坊导出时内嵌资源。");
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){Uri uri=request.getUrl();if(isLocal(uri)&&("/index.html".equals(uri.getPath())||"/".equals(uri.getPath())))return false;if(request.isForMainFrame()&&request.hasGesture()&&("https".equals(uri.getScheme())||"http".equals(uri.getScheme())))openExternal(uri);return true;}
            @Override public void onPageFinished(WebView view,String url){WebView.setWebContentsDebuggingEnabled((getApplicationInfo().flags&android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE)!=0);File restore=new File(folder,"restore.json");if(restore.exists())restore.delete();snapshot(null);}
            @Override public void onReceivedError(WebView view,WebResourceRequest request,WebResourceError error){if(request.isForMainFrame())ui.error("页面未能打开，请返回资料库重新导入 HTML。已有学习记录仍保留。");}
        });
        web.setWebChromeClient(new WebChromeClient(){
            @Override public boolean onShowFileChooser(WebView view,ValueCallback<Uri[]> callback,FileChooserParams params){if(fileCallback!=null)fileCallback.onReceiveValue(null);fileCallback=callback;Intent intent=new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*");intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE,params.getMode()==FileChooserParams.MODE_OPEN_MULTIPLE);try{startActivityForResult(intent,FILE);}catch(ActivityNotFoundException e){fileCallback.onReceiveValue(null);fileCallback=null;ui.error("请启用手机的系统文件选择器后重试。");}return true;}
            @Override public boolean onJsPrompt(WebView view,String url,String message,String defaultValue,JsPromptResult result){
                if(EXPORT.equals(message)&&url.startsWith(origin+"/")){result.confirm("");try{if(defaultValue==null||defaultValue.length()>12*1024*1024)throw new IOException("导出文件过大。");JSONObject data=new JSONObject(defaultValue);String raw=data.getString("data");int comma=raw.indexOf(',');if(comma<0)throw new IOException("导出内容不完整。");byte[] bytes=android.util.Base64.decode(raw.substring(comma+1),android.util.Base64.DEFAULT);saveDocument(data.optString("name","学习进度.json"),data.optString("type","application/json"),bytes);}catch(Exception e){ui.error("备份未能生成："+e.getMessage());}return true;}
                return super.onJsPrompt(view,url,message,defaultValue,result);
            }
        });
        web.setDownloadListener((url,userAgent,disposition,mime,length)->{if(url.startsWith("blob:")||url.startsWith("data:"))web.evaluateJavascript("window.__studyKitExport&&window.__studyKitExport("+JSONObject.quote(url)+",'学习进度.json')",null);});
        web.loadUrl(origin+"/index.html");
        if(Build.VERSION.SDK_INT>=33)getOnBackInvokedDispatcher().registerOnBackInvokedCallback(android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT,()->back());
    }

    private String bootstrap() throws Exception {
        JSONObject restore=null;File forced=new File(folder,"restore.json"),snapshot=new File(folder,"snapshot.json");
        if(forced.isFile())restore=CourseStore.readJson(forced);
        String seed=restore==null?"null":restore.toString().replace("<","\\u003c");
        String fallback=snapshot.isFile()?CourseStore.readJson(snapshot).toString().replace("<","\\u003c"):"null";
        String script;
        try(InputStream in=getAssets().open("reader-bootstrap.js")){script=CourseStore.decode(CourseStore.readBytes(in,256*1024));}
        return "<script>(function(){try{const forced="+seed+",fallback="+fallback+";const saved=forced!==null?forced:(localStorage.length===0?fallback:null);if(saved!==null){localStorage.clear();for(const key of Object.keys(saved))localStorage.setItem(key,String(saved[key]));}}catch(e){console.warn('Study Kit restore failed');}})();"+script+"</script>";
    }
    private boolean isLocal(Uri uri){return "https".equals(uri.getScheme())&&("c"+id+".study-kit.invalid").equals(uri.getHost());}
    private static int indexOfIgnoreCase(String s,String what){return s.toLowerCase(Locale.ROOT).indexOf(what);}
    private static WebResourceResponse response(int status,String message){return new WebResourceResponse("text/plain","UTF-8",status,status==403?"Forbidden":"Read error",Collections.emptyMap(),new ByteArrayInputStream(message.getBytes(StandardCharsets.UTF_8)));}
    private void openExternal(Uri uri){new AlertDialog.Builder(this).setTitle("打开资料来源？").setMessage("这个链接需要联网，将在手机浏览器中打开。\n\n"+uri.getHost()).setPositiveButton("打开浏览器",(d,w)->{try{startActivity(new Intent(Intent.ACTION_VIEW,uri));}catch(ActivityNotFoundException e){ui.error("手机没有可用的浏览器。");}}).setNegativeButton("取消",null).show();}
    interface StateReady {void done(JSONObject state);}
    private void snapshot(StateReady callback){if(web==null)return;web.evaluateJavascript("(function(){var out={};for(var i=0;i<localStorage.length;i++){var key=localStorage.key(i);out[key]=localStorage.getItem(key);}return JSON.stringify(out);})()",value->{try{Object decoded=new JSONTokener(value).nextValue();if(!(decoded instanceof String))throw new JSONException("No storage");String json=(String)decoded;if(json.length()>8*1024*1024)throw new IOException("学习记录过大。");JSONObject state=new JSONObject(json);if(!json.equals(lastState)){CourseStore.atomic(new File(folder,"snapshot.json"),json.getBytes(StandardCharsets.UTF_8));lastState=json;}if(callback!=null)callback.done(state);}catch(Exception e){if(callback!=null)ui.error("暂时无法读取学习记录，请等待页面加载完成后重试。");}});}
    private void exportBackup(){snapshot(state->{try{String html;try(InputStream in=new FileInputStream(new File(folder,"index.html"))){html=CourseStore.decode(CourseStore.readBytes(in,CourseStore.MAX_HTML));}JSONObject backup=new JSONObject();JSONObject metadata=store.meta(id);backup.put("filename",metadata.optString("filename")).put("subject",metadata.optString("subject")).put("pinned",metadata.optBoolean("pinned"));backup.put("format","study-kit-backup").put("version",1).put("courseId",id).put("title",title).put("savedAt",System.currentTimeMillis()).put("html",html).put("storage",state);saveDocument(title+"-资料与进度.studybackup.json","application/json",backup.toString().getBytes(StandardCharsets.UTF_8));}catch(Exception e){ui.error("备份未能生成，请稍后重试。");}});}
    private void saveDocument(String name,String type,byte[] bytes) throws Exception {if(pendingName!=null){ui.error("请先完成或取消当前保存，再重新导出。");return;}if(bytes.length>CourseStore.MAX_BACKUP)throw new IOException("备份文件过大。");pendingName=name.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]","_");if(pendingName.length()>150)pendingName=pendingName.substring(0,140)+".json";CourseStore.atomic(pendingFile,bytes);Intent intent=new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType(type.isEmpty()?"application/json":type).putExtra(Intent.EXTRA_TITLE,pendingName);try{startActivityForResult(intent,SAVE);}catch(ActivityNotFoundException e){pendingName=null;throw new IOException("请先启用系统文件选择器。");}}
    @Override public void onActivityResult(int request,int result,Intent data){super.onActivityResult(request,result,data);if(request==FILE){if(fileCallback!=null){Uri[] uris=null;if(result==RESULT_OK&&data!=null){if(data.getClipData()!=null){ClipData clip=data.getClipData();uris=new Uri[clip.getItemCount()];for(int i=0;i<uris.length;i++)uris[i]=clip.getItemAt(i).getUri();}else if(data.getData()!=null)uris=new Uri[]{data.getData()};}fileCallback.onReceiveValue(uris);fileCallback=null;}}else if(request==SAVE){if(result==RESULT_OK&&data!=null&&data.getData()!=null){try(InputStream in=new FileInputStream(pendingFile);OutputStream out=getContentResolver().openOutputStream(data.getData(),"wt")){if(out==null)throw new IOException();byte[] buffer=new byte[16384];int n;while((n=in.read(buffer))!=-1)out.write(buffer,0,n);out.flush();new AlertDialog.Builder(this).setTitle("备份已保存").setMessage("可以把备份复制到其他设备。恢复完整备份时，在资料库中点“导入 HTML”并选择它。").setPositiveButton("知道了",null).show();}catch(Exception e){ui.error("备份未能保存，请检查所选位置的可用空间后重新导出。");}}pendingName=null;pendingFile.delete();}}
    private void leave(){snapshot(state->finish());handler.postDelayed(()->{if(!isFinishing())finish();},400);}
    private void back(){if(web==null){finish();return;}web.evaluateJavascript("(function(){var d=Array.from(document.querySelectorAll('dialog[open]')).pop();if(d){d.close();return true;}return false;})()",value->{if("true".equals(value))return;if(web.canGoBack())web.goBack();else leave();});}
    @Override public void onBackPressed(){back();}
    @Override protected void onResume(){super.onResume();if(web!=null)web.onResume();handler.postDelayed(snapshotLoop,3000);}
    @Override protected void onPause(){handler.removeCallbacks(snapshotLoop);snapshot(null);if(web!=null)web.onPause();super.onPause();}
    @Override protected void onSaveInstanceState(Bundle state){super.onSaveInstanceState(state);state.putString("pendingName",pendingName);}
    @Override protected void onDestroy(){handler.removeCallbacksAndMessages(null);if(fileCallback!=null)fileCallback.onReceiveValue(null);if(web!=null){web.stopLoading();((android.view.ViewGroup)web.getParent()).removeView(web);web.destroy();web=null;}super.onDestroy();}
}
