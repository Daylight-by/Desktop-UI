//! Root-window OLE fallback for transparent WebView2 overlays. Wry registers
//! child windows, but Windows can hit the transparent overlay's root instead.
use std::{cell::Cell, ffi::OsString, os::windows::ffi::OsStringExt};
use tauri::Emitter;
use windows::Win32::System::Ole::RevokeDragDrop;
use windows::{core::implement, Win32::{Foundation::{HWND, POINT, POINTL}, Graphics::Gdi::ScreenToClient, System::{Com::{IDataObject, FORMATETC, DVASPECT_CONTENT, TYMED_HGLOBAL}, Ole::{IDropTarget, IDropTarget_Impl, RegisterDragDrop, ReleaseStgMedium, CF_HDROP, DROPEFFECT, DROPEFFECT_COPY, DROPEFFECT_NONE}, SystemServices::MODIFIERKEYS_FLAGS}, UI::Shell::{DragQueryFileW, HDROP}}};

#[implement(IDropTarget)]
struct RootDropTarget {
    window: tauri::WebviewWindow,
    hwnd: HWND,
    valid: Cell<bool>,
}

impl RootDropTarget {
    fn emit(&self, kind: &str, point: &POINTL, paths: Vec<String>) {
        let mut position = POINT { x: point.x, y: point.y };
        unsafe { let _ = ScreenToClient(self.hwnd, &mut position); }
        let _ = self.window.emit(&format!("tauri://drag-{kind}"), serde_json::json!({
            "position": { "x": position.x, "y": position.y }, "paths": paths
        }));
    }
}

#[allow(non_snake_case)]
impl IDropTarget_Impl for RootDropTarget_Impl {
    fn DragEnter(&self, data: windows_core::Ref<'_, IDataObject>, _: MODIFIERKEYS_FLAGS, pt: &POINTL, effect: *mut DROPEFFECT) -> windows_core::Result<()> {
        let paths = read_paths(data);
        self.valid.set(!paths.is_empty());
        unsafe { *effect = if self.valid.get() { DROPEFFECT_COPY } else { DROPEFFECT_NONE }; }
        if self.valid.get() { self.emit("enter", pt, paths); }
        Ok(())
    }
    fn DragOver(&self, _: MODIFIERKEYS_FLAGS, pt: &POINTL, effect: *mut DROPEFFECT) -> windows_core::Result<()> {
        unsafe { *effect = if self.valid.get() { DROPEFFECT_COPY } else { DROPEFFECT_NONE }; }
        if self.valid.get() { self.emit("over", pt, Vec::new()); }
        Ok(())
    }
    fn DragLeave(&self) -> windows_core::Result<()> {
        self.valid.set(false);
        let _ = self.window.emit("tauri://drag-leave", ());
        Ok(())
    }
    fn Drop(&self, data: windows_core::Ref<'_, IDataObject>, _: MODIFIERKEYS_FLAGS, pt: &POINTL, effect: *mut DROPEFFECT) -> windows_core::Result<()> {
        let paths = read_paths(data);
        unsafe { *effect = if paths.is_empty() { DROPEFFECT_NONE } else { DROPEFFECT_COPY }; }
        if !paths.is_empty() { self.emit("drop", pt, paths); }
        self.valid.set(false);
        Ok(())
    }
}

fn read_paths(data: windows_core::Ref<'_, IDataObject>) -> Vec<String> {
    let Some(data) = data.as_ref() else { return Vec::new(); };
    let format = FORMATETC { cfFormat: CF_HDROP.0, ptd: std::ptr::null_mut(), dwAspect: DVASPECT_CONTENT.0, lindex: -1, tymed: TYMED_HGLOBAL.0 as u32 };
    unsafe {
        let Ok(mut medium) = data.GetData(&format) else { return Vec::new(); };
        let drop = HDROP(medium.u.hGlobal.0);
        let mut paths = Vec::new();
        for index in 0..DragQueryFileW(drop, u32::MAX, None).min(256) {
            let length = DragQueryFileW(drop, index, None) as usize;
            let mut buffer = vec![0u16; length + 1];
            DragQueryFileW(drop, index, Some(&mut buffer));
            paths.push(OsString::from_wide(&buffer[..length]).to_string_lossy().into_owned());
        }
        ReleaseStgMedium(&mut medium);
        paths
    }
}

pub fn register(window: &tauri::WebviewWindow) -> crate::error::Result<()> {
    let hwnd = window.hwnd()?.0 as isize;
    let handle = window.clone();
    window.with_webview(move |_| {
        let hwnd = HWND(hwnd as _);
        let mut children: Vec<HWND> = vec![hwnd];
        unsafe extern "system" fn collect(child: HWND, data: windows::Win32::Foundation::LPARAM) -> windows::core::BOOL {
            unsafe { (&mut *(data.0 as *mut Vec<HWND>)).push(child); }
            true.into()
        }
        unsafe {
            let _ = windows::Win32::UI::WindowsAndMessaging::EnumChildWindows(Some(hwnd), Some(collect), windows::Win32::Foundation::LPARAM(&mut children as *mut _ as isize));
        }
        // RegisterDragDrop retains the COM target until the native HWND is destroyed.
        // Tao installs its own root target which does not feed the WebView
        // listener. Replace that target on this window's STA thread.
        for child in children {
            let target: IDropTarget = RootDropTarget { window: handle.clone(), hwnd, valid: Cell::new(false) }.into();
            unsafe { let _ = RevokeDragDrop(child); }
            if let Err(error) = unsafe { RegisterDragDrop(child, &target) } {
                log::warn!("File drop registration failed: {error}");
            }
        }
    })?;
    Ok(())
}
