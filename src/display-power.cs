using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Windows.Forms;

// Event driven monitor-power notifications. No screen capture or polling.
class DisplayPowerWindow : NativeWindow, IDisposable {
    [DllImport("user32.dll", SetLastError=true)] static extern IntPtr RegisterPowerSettingNotification(IntPtr hwnd, ref Guid guid, uint flags);
    [DllImport("user32.dll")] static extern bool UnregisterPowerSettingNotification(IntPtr handle);
    IntPtr registration;
    Guid setting = new Guid("6fe69556-704a-47a0-8f24-c28d936fda47");
    public DisplayPowerWindow() {
        CreateHandle(new CreateParams { Caption="bgapp display power listener" });
        registration=RegisterPowerSettingNotification(Handle,ref setting,0);
        if(registration==IntPtr.Zero) throw new InvalidOperationException("Power notification unavailable");
    }
    protected override void WndProc(ref Message message) {
        if(message.Msg==0x218 && message.WParam.ToInt64()==0x8013 && message.LParam!=IntPtr.Zero) {
            Guid received=(Guid)Marshal.PtrToStructure(message.LParam,typeof(Guid));
            if(received==setting && Marshal.ReadInt32(message.LParam,16)>=4) {
                Console.WriteLine(Marshal.ReadInt32(message.LParam,20)==0?"off":"on");
                Console.Out.Flush();
            }
        }
        base.WndProc(ref message);
    }
    public void Dispose() { if(registration!=IntPtr.Zero)UnregisterPowerSettingNotification(registration);DestroyHandle(); }
    [STAThread] static void Main(string[] args) {
        try {
            int parent=int.Parse(args[0]);
            using(var window=new DisplayPowerWindow())
            using(var timer=new Timer()) {
                timer.Interval=5000;
                timer.Tick+=(s,e)=>{try{if(Process.GetProcessById(parent).HasExited)Application.ExitThread();}catch{Application.ExitThread();}};
                timer.Start();Application.Run();
            }
        } catch { Environment.ExitCode=1; }
    }
}
