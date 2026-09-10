package uz.osonmoliya.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.webkit.CookieManager;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.core.content.FileProvider;
import java.io.File;
import java.util.ArrayList;
import java.util.List;

public class WebViewActivity extends Activity {
    private static final String HOST = "oson-moliya.vercel.app";
    private static final String BASE_URL = "https://" + HOST;
    private static final String DEFAULT_URL = BASE_URL + "/capture?mode=voice";
    private static final long   STALE_MS = 10 * 60 * 1000; // 10 minutes

    private static final String ACTION_CAPTURE_VOICE = "uz.osonmoliya.app.CAPTURE_VOICE";
    private static final String ACTION_CAPTURE_PHOTO = "uz.osonmoliya.app.CAPTURE_PHOTO";
    private static final String ACTION_CAPTURE_TEXT  = "uz.osonmoliya.app.CAPTURE_TEXT";

    private static final int REQ_RECORD_AUDIO = 200;
    private static final int REQ_FILE_CHOOSER = 300;

    private WebView webView;
    private ValueCallback<Uri[]> filePathCallback;
    private Uri cameraPhotoUri;
    private long backgroundedAt = 0;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        webView = new WebView(this);
        setContentView(webView);

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);

        // Google OAuth blocks generic WebView user agents ("disallowed_useragent").
        // Strip the "; wv" marker and the embedded Chrome "Version/X.Y" token that
        // identify this as a WebView so Google's auth flow allows it through, then
        // tag the UA so the server can recognise the wrapped app.
        String ua = s.getUserAgentString()
            .replace("; wv", "")
            .replaceAll("Version/\\d+\\.\\d+ ", "")
            + " OsonMoliyaApp/1";
        s.setUserAgentString(ua);

        CookieManager.getInstance().setAcceptCookie(true);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest req) {
                Uri u = req.getUrl();
                String host = u.getHost() == null ? "" : u.getHost();
                if (host.equals(HOST)
                    || host.endsWith(".google.com")
                    || host.equals("google.com")
                    || host.endsWith(".googleapis.com")
                    || host.endsWith(".gstatic.com")) {
                    return false;
                }
                startActivity(new Intent(Intent.ACTION_VIEW, u));
                return true;
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(() -> {
                    String originHost = Uri.parse(request.getOrigin().toString()).getHost();
                    boolean weHoldRecordAudio = getPackageManager().checkPermission(
                        Manifest.permission.RECORD_AUDIO, getPackageName()) == PackageManager.PERMISSION_GRANTED;
                    List<String> granted = new ArrayList<>();
                    for (String res : request.getResources()) {
                        if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(res)
                            && HOST.equals(originHost)
                            && weHoldRecordAudio) {
                            granted.add(res);
                        }
                    }
                    if (!granted.isEmpty()) {
                        request.grant(granted.toArray(new String[0]));
                    } else {
                        request.deny();
                    }
                });
            }

            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                                              FileChooserParams params) {
                if (filePathCallback != null) {
                    filePathCallback.onReceiveValue(null);
                    filePathCallback = null;
                }
                filePathCallback = callback;
                cameraPhotoUri = null;

                boolean wantsImage = false;
                String[] acceptTypes = params.getAcceptTypes();
                if (acceptTypes != null) {
                    for (String t : acceptTypes) {
                        if (t != null && t.startsWith("image/")) wantsImage = true;
                    }
                }

                if (params.isCaptureEnabled() && wantsImage) {
                    if (launchCamera()) return true;
                }

                Intent contentIntent = new Intent(Intent.ACTION_GET_CONTENT);
                contentIntent.addCategory(Intent.CATEGORY_OPENABLE);
                contentIntent.setType(wantsImage ? "image/*" : "*/*");
                try {
                    startActivityForResult(Intent.createChooser(contentIntent, "Fayl tanlang"), REQ_FILE_CHOOSER);
                } catch (Exception e) {
                    filePathCallback.onReceiveValue(null);
                    filePathCallback = null;
                    return false;
                }
                return true;
            }
        });

        if (Build.VERSION.SDK_INT >= 23 && getPackageManager().checkPermission(
                Manifest.permission.RECORD_AUDIO, getPackageName()) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, REQ_RECORD_AUDIO);
        }

        if (savedInstanceState == null) {
            webView.loadUrl(urlForIntent(getIntent()));
        }
    }

    private boolean launchCamera() {
        try {
            File dir = new File(getExternalFilesDir(Environment.DIRECTORY_PICTURES), "captures");
            if (!dir.exists()) dir.mkdirs();
            File photoFile = new File(dir, "capture_" + System.currentTimeMillis() + ".jpg");
            cameraPhotoUri = FileProvider.getUriForFile(this, getPackageName() + ".fileprovider", photoFile);

            Intent captureIntent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
            captureIntent.putExtra(MediaStore.EXTRA_OUTPUT, cameraPhotoUri);
            captureIntent.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            if (captureIntent.resolveActivity(getPackageManager()) == null) {
                cameraPhotoUri = null;
                return false;
            }
            startActivityForResult(captureIntent, REQ_FILE_CHOOSER);
            return true;
        } catch (Exception e) {
            cameraPhotoUri = null;
            return false;
        }
    }

    private String urlForIntent(Intent intent) {
        String action = intent == null ? null : intent.getAction();
        if (ACTION_CAPTURE_PHOTO.equals(action)) return BASE_URL + "/capture?mode=photo";
        if (ACTION_CAPTURE_TEXT.equals(action))  return BASE_URL + "/capture?mode=text";
        if (ACTION_CAPTURE_VOICE.equals(action)) return BASE_URL + "/capture?mode=voice";
        return DEFAULT_URL;
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        webView.loadUrl(urlForIntent(intent));
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != REQ_FILE_CHOOSER) return;
        if (filePathCallback == null) return;

        Uri[] results = null;
        if (resultCode == RESULT_OK) {
            if (data != null && data.getData() != null) {
                results = new Uri[]{ data.getData() };
            } else if (cameraPhotoUri != null) {
                results = new Uri[]{ cameraPhotoUri };
            }
        }
        filePathCallback.onReceiveValue(results);
        filePathCallback = null;
        cameraPhotoUri = null;
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (backgroundedAt != 0 && System.currentTimeMillis() - backgroundedAt > STALE_MS) {
            webView.loadUrl(urlForIntent(getIntent()));
        }
        backgroundedAt = 0;
    }

    @Override
    protected void onPause() {
        super.onPause();
        backgroundedAt = System.currentTimeMillis();
        CookieManager.getInstance().flush();
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }
}
