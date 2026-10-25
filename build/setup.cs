using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Reflection;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Win32;

// 计划清单安装向导
class SetupForm : Form
{
    const string AppName = "计划清单";
    const string AppVer = "0.13.1";
    const string AppExe = "计划清单.exe";

    readonly Panel content = new Panel();
    readonly Label title = new Label();
    readonly Label subtitle = new Label();
    readonly Button backBtn = new Button();
    readonly Button nextBtn = new Button();
    readonly Button cancelBtn = new Button();

    // 第 1 步：选路径
    readonly TextBox pathBox = new TextBox();
    readonly Button browseBtn = new Button();
    readonly CheckBox desktopChk = new CheckBox();
    readonly Label spaceLabel = new Label();
    readonly Label pathLabel = new Label();
    readonly Label pathHint = new Label();
    readonly Label welcomeBody = new Label();
    readonly Label doneLabel = new Label();

    // 第 2 步：进度
    readonly ProgressBar bar = new ProgressBar();
    readonly Label statusLabel = new Label();

    // 第 3 步：完成
    readonly CheckBox runChk = new CheckBox();

    int step;
    bool installing;

    public SetupForm()
    {
        Text = AppName + " " + AppVer + " 安装向导";
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        StartPosition = FormStartPosition.CenterScreen;
        ClientSize = new Size(560, 380);
        BackColor = Color.White;
        Font = new Font("Microsoft YaHei UI", 9F);

        title.SetBounds(28, 24, 500, 30);
        title.Text = "欢迎使用 " + AppName + " 安装向导";
        title.Font = new Font("Microsoft YaHei UI", 15F, FontStyle.Bold);
        title.ForeColor = Color.FromArgb(32, 36, 42);

        subtitle.SetBounds(30, 60, 500, 22);
        subtitle.Text = "这个向导将引导你完成安装。";
        subtitle.ForeColor = Color.FromArgb(122, 128, 136);

        content.SetBounds(28, 96, 504, 200);

        backBtn.Text = "上一步";
        backBtn.SetBounds(258, 330, 90, 32);
        backBtn.Click += (s, e) => GoStep(step - 1);

        nextBtn.Text = "下一步";
        nextBtn.SetBounds(356, 330, 90, 32);
        nextBtn.Click += (s, e) => OnNext();

        cancelBtn.Text = "取消";
        cancelBtn.SetBounds(454, 330, 90, 32);
        cancelBtn.Click += (s, e) => Close();

        Controls.AddRange(new Control[] { title, subtitle, content, backBtn, nextBtn, cancelBtn });

        BuildPathPage();
        BuildProgressPage();
        BuildFinishPage();
        GoStep(0);
    }

    void BuildPathPage()
    {
        pathLabel.Text = "安装位置";
        pathLabel.Bounds = new Rectangle(0, 0, 120, 22);
        pathLabel.ForeColor = Color.FromArgb(60, 66, 74);
        pathBox.SetBounds(0, 26, 388, 28);
        pathBox.Text = DefaultDir();
        browseBtn.Text = "浏览…";
        browseBtn.SetBounds(396, 25, 84, 29);
        browseBtn.Click += (s, e) =>
        {
            using (var dlg = new FolderBrowserDialog { Description = "选择安装位置" })
            {
                dlg.SelectedPath = pathBox.Text;
                if (dlg.ShowDialog() == DialogResult.OK) pathBox.Text = dlg.SelectedPath;
            }
        };
        spaceLabel.SetBounds(0, 66, 500, 22);
        spaceLabel.Text = "需要约 320 MB 磁盘空间。";
        spaceLabel.ForeColor = Color.FromArgb(122, 128, 136);
        desktopChk.SetBounds(0, 100, 300, 24);
        desktopChk.Text = "创建桌面快捷方式";
        desktopChk.Checked = true;
        pathHint.Text = "安装不需要管理员权限；程序装在这里，任务数据放在用户目录，升级不会覆盖。";
        pathHint.Bounds = new Rectangle(0, 138, 500, 44);
        pathHint.ForeColor = Color.FromArgb(122, 128, 136);

        content.Controls.AddRange(new Control[]
        {
            pathLabel, pathBox, browseBtn, spaceLabel, desktopChk, pathHint
        });

        welcomeBody.Bounds = new Rectangle(0, 0, 500, 150);
        welcomeBody.Text = "计划清单 " + AppVer + "\n\n日历 + 待办 + 提醒 + 托盘 + AI 分析。\n\n点击「下一步」继续。";
        content.Controls.Add(welcomeBody);
    }

    void BuildProgressPage()
    {
        bar.SetBounds(0, 40, 500, 18);
        bar.Minimum = 0;
        bar.Maximum = 100;
        statusLabel.SetBounds(0, 70, 500, 22);
        statusLabel.Text = "准备安装…";
        statusLabel.ForeColor = Color.FromArgb(60, 66, 74);
        content.Controls.AddRange(new Control[] { bar, statusLabel });
    }

    void BuildFinishPage()
    {
        doneLabel.Text = "安装完成";
        doneLabel.Bounds = new Rectangle(0, 0, 400, 26);
        doneLabel.Font = new Font("Microsoft YaHei UI", 11F, FontStyle.Bold);
        doneLabel.ForeColor = Color.FromArgb(32, 36, 42);
        runChk.SetBounds(0, 44, 300, 24);
        runChk.Text = "立即运行 " + AppName;
        runChk.Checked = true;
        content.Controls.AddRange(new Control[] { doneLabel, runChk });
    }

    Control[] PathControls
    {
        get { return new Control[] { pathLabel, pathBox, browseBtn, spaceLabel, desktopChk, pathHint }; }
    }

    Control[] ProgressControls
    {
        get { return new Control[] { bar, statusLabel }; }
    }

    Control[] FinishControls
    {
        get { return new Control[] { doneLabel, runChk }; }
    }

    /// <summary>按顺序找一个真正能写的默认目录</summary>
    /// <summary>把诊断信息写到 exe 同目录的 setup.log</summary>
    static void Log(string line)
    {
        try
        {
            string path = Path.Combine(
                Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location), "setup.log");
            File.AppendAllText(path, DateTime.Now.ToString("HH:mm:ss") + " " + line + Environment.NewLine);
        }
        catch { }
    }
    public static string DefaultDir()
    {
        string local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        string profile = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        string exeDir = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);

        var candidates = new System.Collections.Generic.List<string>
        {
            Path.Combine(local, "Programs", AppName),
            Path.Combine(profile, AppName),
            Path.Combine(profile, "Documents", AppName)
        };
        if (!string.IsNullOrEmpty(exeDir))
        {
            candidates.Add(Path.Combine(exeDir, AppName));
        }

        foreach (string dir in candidates)
        {
            try
            {
                Directory.CreateDirectory(dir);
                string probe = Path.Combine(dir, ".probe");
                File.WriteAllText(probe, "ok");
                File.Delete(probe);
                Log("候选可写: " + dir);
                return dir;
            }
            catch (Exception ex)
            {
                Log("候选失败: " + dir + " -> " + ex.GetType().Name + ": " + ex.Message);
            }
        }
        return Path.Combine(local, "Programs", AppName);
    }

    void GoStep(int target)
    {
        if (installing) return;
        step = Math.Max(0, Math.Min(3, target));

        foreach (Control c in content.Controls) c.Visible = false;

        if (step == 0)
        {
            title.Text = "欢迎使用 " + AppName + " 安装向导";
            subtitle.Text = "这个向导将引导你完成安装。";
            welcomeBody.Visible = true;
            backBtn.Enabled = false;
            nextBtn.Text = "下一步";
            nextBtn.Enabled = true;
            cancelBtn.Enabled = true;
        }
        else if (step == 1)
        {
            title.Text = "选择安装位置";
            subtitle.Text = "选择要安装到的文件夹。";
            foreach (Control c in PathControls) c.Visible = true;
            backBtn.Enabled = true;
            nextBtn.Text = "安装";
            nextBtn.Enabled = true;
            cancelBtn.Enabled = true;
        }
        else if (step == 2)
        {
            title.Text = "正在安装";
            subtitle.Text = "请稍候，正在复制文件。";
            foreach (Control c in ProgressControls) c.Visible = true;
            bar.Value = 0;
            statusLabel.Text = "准备安装…";
            backBtn.Enabled = false;
            nextBtn.Enabled = false;
            cancelBtn.Enabled = false;
        }
        else
        {
            title.Text = "安装完成";
            subtitle.Text = AppName + " 已安装到你的电脑。";
            foreach (Control c in FinishControls) c.Visible = true;
            bar.Value = 100;
            backBtn.Enabled = false;
            nextBtn.Text = "完成";
            nextBtn.Enabled = true;
            cancelBtn.Enabled = false;
        }
    }

    void OnNext()
    {
        if (step == 1)
        {
            string dir = pathBox.Text.Trim();
            if (dir.Length == 0)
            {
                MessageBox.Show("请选择安装位置。", AppName, MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }
            try
            {
                Directory.CreateDirectory(dir);
                string probe = Path.Combine(dir, ".probe");
                File.WriteAllText(probe, "ok");
                File.Delete(probe);
            }
            catch (Exception ex)
            {
                MessageBox.Show("这个位置写不进去：\n" + ex.Message + "\n\n请换一个你能写入的文件夹，例如 D:\\计划清单。",
                    AppName, MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }
            GoStep(2);
            RunInstallAsync(dir);
        }
        else if (step == 3)
        {
            if (runChk.Checked) LaunchApp(Path.Combine(pathBox.Text.Trim(), AppExe));
            Close();
        }
        else
        {
            GoStep(step + 1);
        }
    }

    async Task RunInstallAsync(string dir)
    {
        installing = true;
        try
        {
            await Task.Run(() => ExtractPayload(dir, (pct, name) =>
            {
                BeginInvoke(new Action(() =>
                {
                    bar.Value = Math.Min(100, pct);
                    statusLabel.Text = "正在安装：" + name;
                }));
            }));

            statusLabel.Text = "正在创建快捷方式…";
            CreateShortcuts(dir, desktopChk.Checked);
            WriteUninstallEntry(dir);
            File.Copy(Assembly.GetExecutingAssembly().Location, Path.Combine(dir, "uninstall.exe"), true);

            statusLabel.Text = "完成";
            installing = false;
            GoStep(3);
        }
        catch (Exception ex)
        {
            installing = false;
            MessageBox.Show("安装失败：\n" + ex.Message, AppName, MessageBoxButtons.OK, MessageBoxIcon.Error);
            GoStep(1);
        }
    }

    static void ExtractPayload(string dir, Action<int, string> progress)
    {
        using (Stream stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("Payload"))
        {
            if (stream == null) throw new Exception("安装包损坏：找不到内置文件");
            using (var zip = new ZipArchive(stream, ZipArchiveMode.Read))
            {
                long total = zip.Entries.Sum(x => Math.Max(x.Length, 1));
                long done = 0;
                foreach (ZipArchiveEntry entry in zip.Entries)
                {
                    string dest = Path.Combine(dir, entry.FullName.Replace('/', Path.DirectorySeparatorChar));
                    if (entry.FullName.EndsWith("/"))
                    {
                        Directory.CreateDirectory(dest);
                        continue;
                    }
                    Directory.CreateDirectory(Path.GetDirectoryName(dest));
                    entry.ExtractToFile(dest, true);
                    done += Math.Max(entry.Length, 1);
                    progress((int)(done * 100 / total), Path.GetFileName(entry.FullName));
                }
            }
        }
    }

    static void CreateShortcuts(string dir, bool desktop)
    {
        string exe = Path.Combine(dir, AppExe);
        try
        {
            if (desktop)
            {
                string common = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
                MakeShortcut(Path.Combine(common, AppName + ".lnk"), exe, dir);
            }
            string programs = Environment.GetFolderPath(Environment.SpecialFolder.Programs);
            string menuDir = Path.Combine(programs, AppName);
            Directory.CreateDirectory(menuDir);
            MakeShortcut(Path.Combine(menuDir, AppName + ".lnk"), exe, dir);
        }
        catch
        {
            // 快捷方式失败不阻断安装
        }
    }

    static void MakeShortcut(string path, string target, string workDir)
    {
        Type shellType = Type.GetTypeFromProgID("WScript.Shell");
        dynamic shell = Activator.CreateInstance(shellType);
        dynamic lnk = shell.CreateShortcut(path);
        lnk.TargetPath = target;
        lnk.WorkingDirectory = workDir;
        lnk.IconLocation = target + ",0";
        lnk.Save();
    }

    static void WriteUninstallEntry(string dir)
    {
        string exe = Path.Combine(dir, AppExe);
        string uninstaller = Path.Combine(dir, "uninstall.exe");
        string key = @"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\" + AppName;
        try
        {
            using (RegistryKey k = Registry.CurrentUser.CreateSubKey(key))
            {
                k.SetValue("DisplayName", AppName);
                k.SetValue("DisplayVersion", AppVer);
                k.SetValue("Publisher", AppName);
                k.SetValue("InstallLocation", dir);
                k.SetValue("DisplayIcon", exe);
                k.SetValue("UninstallString", "\"" + uninstaller + "\" /uninstall");
                k.SetValue("QuietUninstallString", "\"" + uninstaller + "\" /uninstall /S");
                k.SetValue("NoModify", 1, RegistryValueKind.DWord);
                k.SetValue("NoRepair", 1, RegistryValueKind.DWord);
            }
        }
        catch
        {
            // 注册表写不了也不影响使用
        }
    }

    /// <summary>用 Explorer 启动，避免继承管理员权限</summary>
    static void LaunchApp(string exe)
    {
        try
        {
            Process.Start(new ProcessStartInfo("explorer.exe", "\"" + exe + "\"") { UseShellExecute = true });
        }
        catch { }
    }

    // 供静默安装调用的公开入口
    public static void ExtractPayloadPublic(string dir, Action<int, string> progress)
    {
        ExtractPayload(dir, progress);
    }

    public static void CreateShortcutsPublic(string dir, bool desktop)
    {
        CreateShortcuts(dir, desktop);
    }

    public static void WriteUninstallEntryPublic(string dir)
    {
        WriteUninstallEntry(dir);
    }
}

class UninstallForm : Form
{
    const string AppName = "计划清单";
    readonly ProgressBar bar = new ProgressBar();
    readonly Label status = new Label();
    string dir;

    public UninstallForm(string target, bool silent)
    {
        dir = target;
        Text = AppName + " 卸载";
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        StartPosition = FormStartPosition.CenterScreen;
        ClientSize = new Size(460, 180);
        BackColor = Color.White;
        Font = new Font("Microsoft YaHei UI", 9F);

        var head = new Label
        {
            Text = "正在卸载 " + AppName,
            Bounds = new Rectangle(24, 20, 400, 28),
            Font = new Font("Microsoft YaHei UI", 12F, FontStyle.Bold)
        };
        status.SetBounds(24, 62, 400, 22);
        status.Text = "准备中…";
        bar.SetBounds(24, 92, 412, 16);
        Controls.AddRange(new Control[] { head, status, bar });

        Shown += async (s, e) => await DoWorkAsync(silent);
    }

    async Task DoWorkAsync(bool silent)
    {
        try
        {
            if (!silent)
            {
                DialogResult r = MessageBox.Show(
                    "确定要卸载 " + AppName + " 吗？\n\n任务数据会保留，不会删除。",
                    AppName, MessageBoxButtons.YesNo, MessageBoxIcon.Question);
                if (r != DialogResult.Yes) { Close(); return; }
            }

            status.Text = "删除快捷方式…";
            bar.Value = 10;
            RemoveShortcuts();

            status.Text = "删除程序文件…";
            bar.Value = 30;
            await Task.Run(() => RemoveProgramFiles(dir));

            status.Text = "清理注册表…";
            bar.Value = 80;
            try { Registry.CurrentUser.DeleteSubKeyTree(
                @"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\" + AppName, false); } catch { }

            bar.Value = 100;
            status.Text = "完成";

            if (!silent)
            {
                MessageBox.Show("已卸载。你的任务数据没有删除。", AppName, MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
            Close();
        }
        catch (Exception ex)
        {
            MessageBox.Show("卸载失败：\n" + ex.Message, AppName, MessageBoxButtons.OK, MessageBoxIcon.Error);
            Close();
        }
    }

    static void RemoveShortcuts()
    {
        try
        {
            string desktop = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), AppName + ".lnk");
            if (File.Exists(desktop)) File.Delete(desktop);
            string menuDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs), AppName);
            if (Directory.Exists(menuDir)) Directory.Delete(menuDir, true);
        }
        catch { }
    }

    public static void RemoveShortcutsPublic()
    {
        RemoveShortcuts();
    }

    public static void RemoveProgramFilesPublic(string dir)
    {
        RemoveProgramFiles(dir);
    }

    /// <summary>删程序文件，保留 app\data</summary>
    static void RemoveProgramFiles(string dir)
    {
        string keep = Path.Combine(dir, "app", "data");
        bool hasData = File.Exists(Path.Combine(keep, "data.json"));

        foreach (string file in Directory.GetFiles(dir))
        {
            try { File.Delete(file); } catch { }
        }
        foreach (string sub in Directory.GetDirectories(dir))
        {
            string name = Path.GetFileName(sub);
            if (name.Equals("app", StringComparison.OrdinalIgnoreCase))
            {
                foreach (string inner in Directory.GetFiles(sub))
                {
                    try { File.Delete(inner); } catch { }
                }
                foreach (string innerDir in Directory.GetDirectories(sub))
                {
                    if (hasData && innerDir.Equals(keep, StringComparison.OrdinalIgnoreCase)) continue;
                    try { Directory.Delete(innerDir, true); } catch { }
                }
            }
            else
            {
                try { Directory.Delete(sub, true); } catch { }
            }
        }
    }
}

class Program
{
    [STAThread]
    static void Main(string[] args)
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);

        bool silent = args.Any(a => a.Equals("/S", StringComparison.OrdinalIgnoreCase));
        bool uninstall = args.Any(a => a.Equals("/uninstall", StringComparison.OrdinalIgnoreCase));

        if (uninstall)
        {
            string dir = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
            if (silent)
            {
                UninstallForm.RemoveShortcutsPublic();
                UninstallForm.RemoveProgramFilesPublic(dir);
                try
                {
                    Registry.CurrentUser.DeleteSubKeyTree(
                        @"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\计划清单", false);
                }
                catch { }
                return;
            }
            Application.Run(new UninstallForm(dir, false));
            return;
        }

        if (silent)
        {
            string target = null;
            foreach (string a in args)
            {
                if (a.StartsWith("/D=", StringComparison.OrdinalIgnoreCase)) target = a.Substring(3).Trim('"');
            }
            if (target == null)
            {
                target = SetupForm.DefaultDir();
            }
            Directory.CreateDirectory(target);
            SetupForm.ExtractPayloadPublic(target, (p, n) => { });
            SetupForm.CreateShortcutsPublic(target, true);
            SetupForm.WriteUninstallEntryPublic(target);
            File.Copy(Assembly.GetExecutingAssembly().Location, Path.Combine(target, "uninstall.exe"), true);
            try
            {
                File.WriteAllText(
                    Path.Combine(Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location), "install-result.txt"),
                    target);
            }
            catch { }
            return;
        }

        Application.Run(new SetupForm());
    }
}
