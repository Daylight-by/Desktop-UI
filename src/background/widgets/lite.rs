use crate::{
    app::emit_to_webviews,
    error::{Result, ResultLogExt},
    utils::atomic_write_file,
    widgets::weg::SeelenWeg,
};
use seelen_core::{handlers::SeelenEvent, state::WidgetPerm};
use serde_json::Value;

fn preferences_path() -> Result<std::path::PathBuf> {
    Ok(std::env::current_exe()?
        .parent()
        .ok_or("Executable directory unavailable")?
        .join("my-desktop.json"))
}

impl crate::tauri_handlers::Handlers {
    pub fn get_lite_preferences() -> Result<Value> {
        let path = preferences_path()?;
        let mut defaults: Value =
            serde_json::from_str(include_str!("../../static/lite-defaults.json"))?;
        if path.exists() {
            if path.metadata()?.len() > 1_048_576 {
                return Err("Desktop preferences too large".into());
            }
            let saved: Value = serde_json::from_slice(&std::fs::read(&path)?)?;
            let values = saved
                .as_object()
                .ok_or("Desktop preferences must be an object")?;
            defaults.as_object_mut().unwrap().extend(values.clone());
        } else {
            atomic_write_file(&path, serde_json::to_string_pretty(&defaults)?.as_bytes())?;
        }
        defaults["configPath"] = Value::String(path.to_string_lossy().into_owned());
        Ok(defaults)
    }

    pub fn set_lite_preferences(
        webview: tauri::WebviewWindow,
        mut preferences: Value,
    ) -> Result<()> {
        super::permissions::request_widget_permission(&webview, WidgetPerm::ModifyConfiguration)?;
        let map = preferences
            .as_object_mut()
            .ok_or("Desktop preferences must be an object")?;
        map.remove("configPath");
        let data = serde_json::to_vec_pretty(&preferences)?;
        if data.len() > 1_048_576 {
            return Err("Desktop preferences too large".into());
        }
        atomic_write_file(&preferences_path()?, &data)?;
        let hide_native_taskbar = preferences
            .get("hideNativeTaskbar")
            .and_then(Value::as_bool)
            .unwrap_or(true);
        if hide_native_taskbar {
            SeelenWeg::hide_native_taskbar();
        } else {
            SeelenWeg::restore_native_taskbar().log_error();
        }
        emit_to_webviews(
            SeelenEvent::LitePreferencesChanged,
            Self::get_lite_preferences()?,
        );
        Ok(())
    }
}
