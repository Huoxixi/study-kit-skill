package cn.studykit.reader;

import android.app.Activity;
import android.content.res.ColorStateList;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.view.*;
import android.widget.*;

final class Ui {
    final Activity a;final int bg,paper,ink,muted,line,primary;
    Ui(Activity a){this.a=a;boolean dark=(a.getResources().getConfiguration().uiMode&Configuration.UI_MODE_NIGHT_MASK)==Configuration.UI_MODE_NIGHT_YES;bg=Color.parseColor(dark?"#14171F":"#F5F6F8");paper=Color.parseColor(dark?"#202533":"#FFFFFF");ink=Color.parseColor(dark?"#F0F2FA":"#17191D");muted=Color.parseColor(dark?"#B9C2D5":"#626A78");line=Color.parseColor(dark?"#3B4352":"#D8DCE3");primary=Color.parseColor(dark?"#A8B7FF":"#294CFF");a.getWindow().setStatusBarColor(bg);a.getWindow().setNavigationBarColor(bg);a.getWindow().getDecorView().setSystemUiVisibility(dark?0:View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR|View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);}
    int dp(float n){return (int)(n*a.getResources().getDisplayMetrics().density+.5f);}
    LinearLayout column(){LinearLayout v=new LinearLayout(a);v.setOrientation(LinearLayout.VERTICAL);return v;}
    TextView text(String s,int size,int color,boolean bold){TextView t=new TextView(a);t.setText(s);t.setTextSize(size);t.setTextColor(color);t.setLineSpacing(dp(3),1);if(bold)t.setTypeface(Typeface.create("sans-serif-medium",Typeface.NORMAL));return t;}
    Button button(String s,boolean filled){Button b=new Button(a);b.setText(s);b.setTextSize(15);b.setAllCaps(false);b.setMinHeight(dp(48));b.setMinimumHeight(dp(48));b.setPadding(dp(18),dp(8),dp(18),dp(8));b.setTextColor(filled?bg:primary);b.setBackgroundTintList(ColorStateList.valueOf(filled?primary:paper));return b;}
    GradientDrawable surface(int color,int radius,boolean border){GradientDrawable g=new GradientDrawable();g.setColor(color);g.setCornerRadius(dp(radius));if(border)g.setStroke(dp(1),line);return g;}
    LinearLayout.LayoutParams match(){return new LinearLayout.LayoutParams(-1,-2);}
    void gap(LinearLayout v,int n){View gap=new View(a);v.addView(gap,new LinearLayout.LayoutParams(1,dp(n)));}
    LinearLayout root(){LinearLayout root=column();root.setBackgroundColor(bg);root.setFitsSystemWindows(true);root.setOnApplyWindowInsetsListener((v,insets)->{v.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());return insets.consumeSystemWindowInsets();});return root;}
    void error(String message){new android.app.AlertDialog.Builder(a).setTitle("未能完成").setMessage(message).setPositiveButton("知道了",null).show();}
}
