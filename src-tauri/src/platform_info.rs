use serde::Serialize;

#[derive(Serialize)]
pub struct PlatformInfo {
    pub os: &'static str,
    pub tv: Option<bool>,
}

/// Reports the OS and, where the OS can know, whether the device presents
/// itself as a television. This is the signal the frontend's `setNativePlatform`
/// expects at boot (see `src/lib/platform.ts`): web heuristics — pointer media
/// queries, the user agent — are the fallback when a device lies about them,
/// and cheap TV boxes lie a lot.
///
/// On Android the UiModeManager is the source of truth: an Android TV ROM sets
/// UI_MODE_TYPE_TELEVISION, and the leanback feature is a second, independent
/// vote for boxes whose ROM forgets to. Everything else gets a null `tv` and
/// the frontend decides.
#[tauri::command]
pub fn platform_info() -> PlatformInfo {
    #[cfg(target_os = "android")]
    {
        PlatformInfo {
            os: "android",
            tv: android_is_tv(),
        }
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = android_is_tv;
        PlatformInfo { os: "web", tv: None }
    }
}

#[cfg(target_os = "android")]
fn android_is_tv() -> Option<bool> {
    use jni::objects::JObject;

    const UI_MODE_TYPE_MASK: i32 = 0x0f;
    const UI_MODE_TYPE_TELEVISION: i32 = 4;

    let ctx = ndk_context::android_context();
    let vm = unsafe { jni::JavaVM::from_raw(ctx.vm().cast::<jni::sys::JavaVM>()) }.ok()?;
    let mut env = vm.attach_current_thread().ok()?;
    let context = unsafe { JObject::from_raw(ctx.context().cast::<jni::sys::_jobject>()) };

    let resources = env
        .call_method(&context, "getResources", "()Landroid/content/res/Resources;", &[])
        .ok()?
        .l()
        .ok()?;
    let config = env
        .call_method(&resources, "getConfiguration", "()Landroid/content/res/Configuration;", &[])
        .ok()?
        .l()
        .ok()?;
    let mode = env.get_field(&config, "uiMode", "I").ok()?.i().ok()?;

    let leanback_name = env.new_string("android.software.leanback").ok()?;
    let leanback_name_obj = unsafe { JObject::from_raw(leanback_name.as_raw()) };
    let pm = env
        .call_method(
            &context,
            "getPackageManager",
            "()Landroid/content/pm/PackageManager;",
            &[],
        )
        .ok()?
        .l()
        .ok()?;
    let has_leanback = env
        .call_method(
            &pm,
            "hasSystemFeature",
            "(Ljava/lang/String;)Z",
            &[jni::objects::JValue::Object(&leanback_name_obj)],
        )
        .ok()?
        .z()
        .ok()?;

    Some(
        (mode & UI_MODE_TYPE_MASK) == UI_MODE_TYPE_TELEVISION || has_leanback,
    )
}
