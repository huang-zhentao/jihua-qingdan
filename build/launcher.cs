using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Windows.Forms;

// 外层启动器：补上 --no-sandbox，兼容两种布局
//   便携版：exe 同级的 app\*.exe
//   安装版：exe 同级的 *-core.exe
class Launcher
{
    [STAThread]
    static void Main(string[] args)
    {
        try
        {
            string self = Assembly.GetExecutingAssembly().Location;
            string dir = Path.GetDirectoryName(self);
            string target = null;
            string workingDir = dir;

            string appDir = Path.Combine(dir, "app");
            if (Directory.Exists(appDir))
            {
                string[] exes = Directory.GetFiles(appDir, "*.exe");
                if (exes.Length > 0)
                {
                    target = exes[0];
                    workingDir = appDir;
                }
            }

            if (target == null)
            {
                string[] cores = Directory.GetFiles(dir, "*-core.exe");
                if (cores.Length > 0)
                {
                    target = cores[0];
                }
            }

            if (target == null)
            {
                foreach (string file in Directory.GetFiles(dir, "*.exe"))
                {
                    if (!string.Equals(file, self, StringComparison.OrdinalIgnoreCase))
                    {
                        target = file;
                        break;
                    }
                }
            }

            if (target == null)
            {
                MessageBox.Show("找不到主程序，请重新安装。", "计划清单");
                return;
            }

            string arguments = "--no-sandbox";
            if (args.Length > 0)
            {
                arguments += " " + string.Join(" ", args);
            }

            var startInfo = new ProcessStartInfo(target, arguments)
            {
                UseShellExecute = false,
                WorkingDirectory = workingDir
            };
            Process.Start(startInfo);
        }
        catch (Exception ex)
        {
            MessageBox.Show(ex.Message, "计划清单启动失败");
        }
    }
}
