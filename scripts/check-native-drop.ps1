Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies System.Windows.Forms,System.Drawing -TypeDefinition @'
using System;
using System.Threading;
using System.Windows.Forms;
using System.Drawing;
using System.Runtime.InteropServices;
public static class NativeShelfDrop {
 [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
 [DllImport("user32.dll")] static extern IntPtr WindowFromPoint(Point p);
 [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr p,out uint id);
 [DllImport("user32.dll")] static extern bool SetCursorPos(int x,int y);
 [DllImport("user32.dll")] static extern void mouse_event(uint f,uint x,uint y,uint d,UIntPtr e);
 public static void Run(){
  SetProcessDPIAware();
  var form=new Form{Text="Native file-drop check",StartPosition=FormStartPosition.Manual,Location=new Point(300,600),Size=new Size(240,110),TopMost=true};
  var button=new Button{Text="File drag check",Dock=DockStyle.Fill};form.Controls.Add(button);
  button.MouseDown+=(s,e)=>{ var data=new DataObject();data.SetData(DataFormats.FileDrop,new string[]{@"D:\Apps\Seelen-UI-lite\README.md"});var result=button.DoDragDrop(data,DragDropEffects.Copy|DragDropEffects.Link);Console.WriteLine("OLE result: "+result);form.Close();};
  form.Shown+=(s,e)=>{ var pt=button.PointToScreen(new Point(50,30));new Thread(()=>{Thread.Sleep(300);SetCursorPos(pt.X,pt.Y);mouse_event(2,0,0,0,UIntPtr.Zero);Thread.Sleep(400);for(int i=1;i<=25;i++){SetCursorPos(pt.X+(1280-pt.X)*i/25,pt.Y+(165-pt.Y)*i/25);Thread.Sleep(35);}Thread.Sleep(500);uint pid;var h=WindowFromPoint(new Point(1280,165));GetWindowThreadProcessId(h,out pid);Console.WriteLine("Target HWND="+h+" PID="+pid);mouse_event(4,0,0,0,UIntPtr.Zero);}).Start();};
  var timer=new System.Windows.Forms.Timer{Interval=7000};timer.Tick+=(s,e)=>{mouse_event(4,0,0,0,UIntPtr.Zero);form.Close();};timer.Start();Application.Run(form);timer.Dispose();form.Dispose();
 }
}
'@
[NativeShelfDrop]::Run()
