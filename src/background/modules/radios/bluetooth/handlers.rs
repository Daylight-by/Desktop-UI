use seelen_core::{
    handlers::SeelenEvent,
    system_state::{BluetoothDevice, DevicePairingAnswer, DevicePairingNeededAction},
};
use windows::Devices::Enumeration::{DevicePairingResultStatus, DeviceUnpairingResultStatus};

use crate::{
    app::emit_to_webviews, error::Result, modules::radios::bluetooth::manager::BluetoothManager,
};

fn get_bluetooth_manager() -> &'static BluetoothManager {
    static INIT: std::sync::Once = std::sync::Once::new();
    INIT.call_once(|| {
        BluetoothManager::subscribe(|_e| {
            emit_to_webviews(
                SeelenEvent::BluetoothDevicesChanged,
                BluetoothManager::instance().get_all_devices(),
            );
        });
    });
    BluetoothManager::instance()
}

impl crate::tauri_handlers::Handlers {
    pub fn get_bluetooth_device_battery(id: String) -> Result<Option<u8>> {
        use windows::Win32::{
            Devices::{
                DeviceAndDriverInstallation::{
                    CM_GETIDLIST_FILTER_PRESENT, CM_Get_DevNode_PropertyW,
                    CM_Get_Device_ID_List_SizeW, CM_Get_Device_ID_ListW, CM_LOCATE_DEVNODE_FLAGS,
                    CM_Locate_DevNodeW, CR_SUCCESS,
                },
                Properties::{DEVPROP_TYPE_BYTE, DEVPROPTYPE},
            },
            Foundation::DEVPROPKEY,
        };
        use windows_core::{GUID, PCWSTR};

        let Some(device) = get_bluetooth_manager()
            .get_all_devices()
            .into_iter()
            .find(|device| device.id == id && device.connected)
        else {
            return Ok(None);
        };
        // Windows caches HFP/BLE battery percentages on a Bluetooth PnP node, often
        // a Hands-Free child rather than the primary device. Match the radio address,
        // never the display name (two headsets may have the same name).
        // This optional property is not guaranteed by every driver/device.
        let key = DEVPROPKEY {
            fmtid: GUID::from_u128(0x104ea319_6ee2_4701_bd47_8ddbf425bbe5),
            pid: 2,
        };
        let address = format!("{:012X}", device.address);
        let mut size = 0;
        if unsafe {
            CM_Get_Device_ID_List_SizeW(&mut size, PCWSTR::null(), CM_GETIDLIST_FILTER_PRESENT)
        } != CR_SUCCESS
            || size > 1_048_576
        {
            return Ok(None);
        }
        let mut ids = vec![0u16; size as usize];
        if unsafe { CM_Get_Device_ID_ListW(PCWSTR::null(), &mut ids, CM_GETIDLIST_FILTER_PRESENT) }
            != CR_SUCCESS
        {
            return Ok(None);
        }
        for instance in ids.split(|c| *c == 0).filter(|s| !s.is_empty()) {
            let text = String::from_utf16_lossy(instance).to_ascii_uppercase();
            if !text.starts_with("BTH") || !text.contains(&address) {
                continue;
            }
            let wide: Vec<u16> = instance.iter().copied().chain(Some(0)).collect();
            let mut node = 0;
            if unsafe {
                CM_Locate_DevNodeW(&mut node, PCWSTR(wide.as_ptr()), CM_LOCATE_DEVNODE_FLAGS(0))
            } != CR_SUCCESS
            {
                continue;
            }
            let mut kind = DEVPROPTYPE::default();
            let mut value = 0u8;
            let mut bytes = 1;
            if unsafe {
                CM_Get_DevNode_PropertyW(node, &key, &mut kind, Some(&mut value), &mut bytes, 0)
            } == CR_SUCCESS
                && kind == DEVPROP_TYPE_BYTE
                && value <= 100
            {
                return Ok(Some(value));
            }
        }
        Ok(None)
    }
    pub fn get_bluetooth_devices() -> Vec<BluetoothDevice> {
        get_bluetooth_manager().get_all_devices()
    }

    pub fn start_bluetooth_scanning() -> Result<()> {
        get_bluetooth_manager().start_scanning()
    }

    pub fn stop_bluetooth_scanning() -> Result<()> {
        get_bluetooth_manager().stop_scanning()
    }

    pub async fn request_pair_bluetooth_device(id: String) -> Result<DevicePairingNeededAction> {
        let manager = get_bluetooth_manager();
        manager.request_pair_device(&id).await
    }

    pub async fn confirm_bluetooth_device_pairing(
        id: String,
        answer: DevicePairingAnswer,
    ) -> Result<()> {
        let expected_status = if answer.accept {
            DevicePairingResultStatus::Paired
        } else {
            DevicePairingResultStatus::RejectedByHandler
        };

        let manager = get_bluetooth_manager();
        let status = manager.confirm_device_pairing(&id, answer).await?;

        if status != expected_status {
            return Err(
                format!("Pairing action was not successful! Current status: {status:?}").into(),
            );
        }
        Ok(())
    }

    pub fn disconnect_bluetooth_device(id: String) -> Result<()> {
        let manager = get_bluetooth_manager();
        manager.disconnect_device(&id)
    }

    pub fn connect_bluetooth_device(id: String) -> Result<()> {
        let manager = get_bluetooth_manager();
        manager.connect_device(&id)
    }

    pub async fn forget_bluetooth_device(id: String) -> Result<()> {
        let manager = get_bluetooth_manager();
        let device = if let Some(classic) = manager.devices.get(&id, |d| d.raw.clone()) {
            classic.DeviceInformation()?
        } else if let Some(le) = manager.le_devices.get(&id, |d| d.raw.clone()) {
            le.DeviceInformation()?
        } else {
            return Ok(());
        };

        let status = device.Pairing()?.UnpairAsync()?.await?.Status()?;
        if status == DeviceUnpairingResultStatus::AccessDenied
            || status == DeviceUnpairingResultStatus::Failed
        {
            return Err("Unpair was not succesfull!".into());
        }
        Ok(())
    }
}
