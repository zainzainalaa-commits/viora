#[cfg(target_os = "macos")]
mod mac {
    use objc2::msg_send;
    use objc2::rc::Retained;
    use objc2::runtime::{AnyClass, AnyObject};
    use objc2_foundation::NSString;

    const IDLE_DISPLAY_SLEEP_DISABLED: u64 = 1 << 40;
    const IDLE_SYSTEM_SLEEP_DISABLED: u64 = 1 << 20;

    pub struct Token(Retained<AnyObject>);
    unsafe impl Send for Token {}

    pub fn begin() -> Option<Token> {
        let cls = AnyClass::get(c"NSProcessInfo")?;
        unsafe {
            let info: *mut AnyObject = msg_send![cls, processInfo];
            let info = info.as_ref()?;
            let reason = NSString::from_str("Harbor playback");
            let opts: u64 = IDLE_DISPLAY_SLEEP_DISABLED | IDLE_SYSTEM_SLEEP_DISABLED;
            let token: Retained<AnyObject> =
                msg_send![info, beginActivityWithOptions: opts, reason: &*reason];
            Some(Token(token))
        }
    }

    pub fn end(token: Token) {
        let Some(cls) = AnyClass::get(c"NSProcessInfo") else { return };
        unsafe {
            let info: *mut AnyObject = msg_send![cls, processInfo];
            let Some(info) = info.as_ref() else { return };
            let _: () = msg_send![info, endActivity: &*token.0];
        }
    }
}

#[cfg(target_os = "macos")]
static TOKEN: std::sync::Mutex<Option<mac::Token>> = std::sync::Mutex::new(None);

#[tauri::command]
pub fn power_inhibit(on: bool) {
    #[cfg(target_os = "macos")]
    {
        let mut guard = TOKEN.lock().unwrap();
        match (on, guard.take()) {
            (true, None) => *guard = mac::begin(),
            (true, Some(t)) => *guard = Some(t),
            (false, Some(t)) => mac::end(t),
            (false, None) => {}
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = on;
    }
}
