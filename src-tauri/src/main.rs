// Windows 上 release 构建不弹黑色控制台窗口。
// 这行只会影响 Windows —— macOS/Linux 上没有 console 子系统的概念。
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    prunus_lib::run()
}
