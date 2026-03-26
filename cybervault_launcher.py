"""
CyberVault Launcher — Cyberpunk-themed Python GUI
Merges all Claude branches into main, clones repo if needed,
installs dependencies, and runs dev/build modes.
"""

import tkinter as tk
from tkinter import scrolledtext, filedialog, messagebox
import subprocess
import threading
import os
import re

REPO_URL = "https://github.com/shaa123/Cybervault2.git"
REPO_NAME = "Cybervault2"

# ── Colors ──────────────────────────────────────────────
BG       = "#0a0a0f"
BG2      = "#0d0d15"
SURFACE  = "#12121c"
BORDER   = "#1e1e35"
CYAN     = "#00f0ff"
MAGENTA  = "#ff00e5"
GREEN    = "#00ff8c"
RED      = "#ff3344"
YELLOW   = "#ffe600"
TEXT     = "#e0e0f0"
DIM      = "#6a6a8a"
MUTED    = "#3a3a55"


class CyberVaultLauncher:
    def __init__(self):
        self.root = tk.Tk()
        self.root.title("CyberVault Launcher")
        self.root.geometry("780x620")
        self.root.configure(bg=BG)
        self.root.resizable(True, True)

        self.repo_path = tk.StringVar(value=self._find_repo())
        self.running = False

        self._build_ui()

    # ── Locate repo ────────────────────────────────────
    def _find_repo(self):
        """Check common locations for the cloned repo. If not found, default to Desktop."""
        candidates = [
            os.path.join(os.getcwd(), REPO_NAME),
            os.path.join(os.path.expanduser("~"), REPO_NAME),
            os.path.join(os.path.expanduser("~"), "Desktop", REPO_NAME),
            os.path.join(os.path.expanduser("~"), "Documents", REPO_NAME),
            os.path.join(os.path.expanduser("~"), "Projects", REPO_NAME),
        ]
        # also check if we're inside the repo already
        cwd = os.getcwd()
        if os.path.isdir(os.path.join(cwd, ".git")) and os.path.basename(cwd) == REPO_NAME:
            return cwd
        for c in candidates:
            if os.path.isdir(os.path.join(c, ".git")):
                return c
        # Not found — default to Desktop
        desktop = os.path.join(os.path.expanduser("~"), "Desktop")
        if not os.path.isdir(desktop):
            desktop = os.path.expanduser("~")
        return os.path.join(desktop, REPO_NAME)

    # ── UI ─────────────────────────────────────────────
    def _build_ui(self):
        r = self.root

        # Title bar
        title_frame = tk.Frame(r, bg=BG2, height=44)
        title_frame.pack(fill="x")
        title_frame.pack_propagate(False)
        tk.Label(title_frame, text="◆", fg=CYAN, bg=BG2, font=("Consolas", 16)).pack(side="left", padx=(14, 6))
        tk.Label(title_frame, text="CYBERVAULT LAUNCHER", fg=TEXT, bg=BG2,
                 font=("Consolas", 12, "bold")).pack(side="left")
        tk.Label(title_frame, text="v2.0", fg=DIM, bg=BG2,
                 font=("Consolas", 8)).pack(side="left", padx=(8, 0), pady=(4, 0))

        # Separator
        tk.Frame(r, bg=BORDER, height=1).pack(fill="x")

        # Repo path section
        path_frame = tk.Frame(r, bg=BG, pady=10, padx=14)
        path_frame.pack(fill="x")
        tk.Label(path_frame, text="REPO PATH", fg=DIM, bg=BG,
                 font=("Consolas", 8)).pack(anchor="w")

        path_row = tk.Frame(path_frame, bg=BG)
        path_row.pack(fill="x", pady=(4, 0))
        self.path_entry = tk.Entry(path_row, textvariable=self.repo_path, fg=TEXT, bg=SURFACE,
                                   insertbackground=CYAN, font=("Consolas", 10),
                                   relief="flat", bd=0, highlightthickness=1,
                                   highlightcolor=CYAN, highlightbackground=BORDER)
        self.path_entry.pack(side="left", fill="x", expand=True, ipady=6, ipadx=6)
        browse_btn = tk.Button(path_row, text="BROWSE", fg=CYAN, bg=SURFACE,
                               activeforeground=BG, activebackground=CYAN,
                               font=("Consolas", 9, "bold"), relief="flat", bd=0,
                               padx=12, cursor="hand2", command=self._browse)
        browse_btn.pack(side="left", padx=(6, 0), ipady=6)

        # Separator
        tk.Frame(r, bg=BORDER, height=1).pack(fill="x")

        # Button grid
        btn_frame = tk.Frame(r, bg=BG, pady=12, padx=14)
        btn_frame.pack(fill="x")
        tk.Label(btn_frame, text="// OPERATIONS", fg=DIM, bg=BG,
                 font=("Consolas", 8)).pack(anchor="w", pady=(0, 8))

        grid = tk.Frame(btn_frame, bg=BG)
        grid.pack(fill="x")
        grid.columnconfigure((0, 1, 2), weight=1)

        buttons = [
            ("⬡  CLONE REPO",        CYAN,    self._clone_repo,      0, 0),
            ("⚡  MERGE BRANCHES",    MAGENTA, self._merge_branches,  0, 1),
            ("◧  INSTALL DEPS",      YELLOW,  self._install_deps,    0, 2),
            ("▶  RUN DEV",           GREEN,   self._run_dev,         1, 0),
            ("◈  BUILD RELEASE",     MAGENTA, self._build_release,   1, 1),
            ("⌫  STOP",             RED,     self._stop_process,    1, 2),
        ]

        for text, color, cmd, row, col in buttons:
            btn = tk.Button(grid, text=text, fg=color, bg=SURFACE,
                            activeforeground=BG, activebackground=color,
                            font=("Consolas", 10, "bold"), relief="flat", bd=0,
                            padx=8, pady=10, cursor="hand2", command=cmd)
            btn.grid(row=row, column=col, padx=3, pady=3, sticky="ew")
            btn.bind("<Enter>", lambda e, b=btn, c=color: b.configure(bg="#1e1e30"))
            btn.bind("<Leave>", lambda e, b=btn: b.configure(bg=SURFACE))

        # Separator
        tk.Frame(r, bg=BORDER, height=1).pack(fill="x")

        # Status bar
        status_frame = tk.Frame(r, bg=BG2, height=28)
        status_frame.pack(fill="x")
        status_frame.pack_propagate(False)
        self.status_label = tk.Label(status_frame, text="READY", fg=GREEN, bg=BG2,
                                     font=("Consolas", 9))
        self.status_label.pack(side="left", padx=14)
        self.status_dot = tk.Label(status_frame, text="●", fg=GREEN, bg=BG2,
                                    font=("Consolas", 8))
        self.status_dot.pack(side="right", padx=14)

        # Separator
        tk.Frame(r, bg=BORDER, height=1).pack(fill="x")

        # Log output
        log_frame = tk.Frame(r, bg=BG, padx=14, pady=8)
        log_frame.pack(fill="both", expand=True)
        tk.Label(log_frame, text="OUTPUT LOG", fg=DIM, bg=BG,
                 font=("Consolas", 8)).pack(anchor="w", pady=(0, 4))

        self.log = scrolledtext.ScrolledText(
            log_frame, bg=SURFACE, fg=TEXT, font=("Consolas", 9),
            relief="flat", bd=0, insertbackground=CYAN, wrap="word",
            highlightthickness=1, highlightcolor=BORDER, highlightbackground=BORDER,
            state="disabled"
        )
        self.log.pack(fill="both", expand=True)
        self.log.tag_configure("cyan", foreground=CYAN)
        self.log.tag_configure("green", foreground=GREEN)
        self.log.tag_configure("red", foreground=RED)
        self.log.tag_configure("yellow", foreground=YELLOW)
        self.log.tag_configure("magenta", foreground=MAGENTA)

    # ── Helpers ────────────────────────────────────────
    def _log(self, msg, tag=None):
        self.log.configure(state="normal")
        if tag:
            self.log.insert("end", msg + "\n", tag)
        else:
            self.log.insert("end", msg + "\n")
        self.log.see("end")
        self.log.configure(state="disabled")

    def _set_status(self, text, color=GREEN):
        self.status_label.configure(text=text, fg=color)
        self.status_dot.configure(fg=color)

    def _browse(self):
        d = filedialog.askdirectory(title="Select parent folder for repo")
        if d:
            self.repo_path.set(os.path.join(d, REPO_NAME))

    def _get_path(self):
        p = self.repo_path.get().strip()
        if not p:
            self._log("ERROR: Set a repo path first.", "red")
            return None
        return p

    def _run_cmd(self, cmd, cwd=None, shell=False):
        """Run a command, stream output to log. Returns (returncode, full_output)."""
        self._log(f"$ {cmd if isinstance(cmd, str) else ' '.join(cmd)}", "cyan")
        try:
            proc = subprocess.Popen(
                cmd, cwd=cwd, shell=shell,
                stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                text=True, bufsize=1
            )
            self._current_proc = proc
            output = []
            for line in proc.stdout:
                line = line.rstrip()
                output.append(line)
                self.root.after(0, self._log, line)
            proc.wait()
            self._current_proc = None
            return proc.returncode, "\n".join(output)
        except FileNotFoundError:
            self._log(f"ERROR: Command not found: {cmd[0] if isinstance(cmd, list) else cmd}", "red")
            return 1, ""
        except Exception as e:
            self._log(f"ERROR: {e}", "red")
            return 1, ""

    def _threaded(self, fn):
        """Run function in background thread."""
        if self.running:
            self._log("Another operation is already running.", "yellow")
            return
        self.running = True
        def wrapper():
            try:
                fn()
            finally:
                self.running = False
        threading.Thread(target=wrapper, daemon=True).start()

    # ── Clone ──────────────────────────────────────────
    def _clone_repo(self):
        path = self.repo_path.get().strip()

        # If path already has a cloned repo, skip
        if path and os.path.isdir(os.path.join(path, ".git")):
            self._log("Repo already cloned at: " + path, "green")
            self._log("Skipping clone.", "green")
            self._set_status("ALREADY CLONED", GREEN)
            return

        # If the default path's parent doesn't exist or user wants to pick, ask
        parent = os.path.dirname(path) if path else ""
        if not path or not os.path.isdir(parent):
            chosen = filedialog.askdirectory(
                title="Pick a folder to clone CyberVault2 into"
            )
            if not chosen:
                self._log("Clone cancelled.", "yellow")
                return
            path = os.path.join(chosen, REPO_NAME)
            self.repo_path.set(path)

        def task():
            # Double-check after user picked
            if os.path.isdir(os.path.join(path, ".git")):
                self._log("Repo already exists at: " + path, "green")
                self._set_status("ALREADY CLONED", GREEN)
                return

            parent_dir = os.path.dirname(path)
            if parent_dir and not os.path.isdir(parent_dir):
                os.makedirs(parent_dir, exist_ok=True)

            self._set_status("CLONING...", CYAN)
            self._log("═" * 50, "cyan")
            self._log(f"CLONING INTO: {path}", "cyan")

            ret, _ = self._run_cmd(["git", "clone", REPO_URL, path])
            if ret == 0:
                self._log("Clone complete!", "green")
                self._set_status("CLONED", GREEN)
            else:
                self._log("Clone failed!", "red")
                self._set_status("CLONE FAILED", RED)

        self._threaded(task)

    # ── Merge all Claude branches ──────────────────────
    def _merge_branches(self):
        def task():
            path = self._get_path()
            if not path or not os.path.isdir(os.path.join(path, ".git")):
                self._log("ERROR: Repo not found. Clone first.", "red")
                return

            self._set_status("MERGING BRANCHES...", MAGENTA)
            self._log("═" * 50, "magenta")
            self._log("FETCHING ALL REMOTE BRANCHES...", "magenta")

            self._run_cmd(["git", "fetch", "--all"], cwd=path)
            self._run_cmd(["git", "checkout", "main"], cwd=path)
            self._run_cmd(["git", "pull", "origin", "main"], cwd=path)

            # List all remote claude/* branches
            ret, output = self._run_cmd(["git", "branch", "-r"], cwd=path)
            if ret != 0:
                self._log("Failed to list branches.", "red")
                self._set_status("MERGE FAILED", RED)
                return

            claude_branches = []
            for line in output.splitlines():
                line = line.strip()
                if "claude/" in line and "HEAD" not in line:
                    claude_branches.append(line)

            if not claude_branches:
                self._log("No Claude branches found. Main is up to date.", "green")
                self._set_status("NOTHING TO MERGE", GREEN)
                return

            self._log(f"Found {len(claude_branches)} Claude branch(es):", "magenta")
            for b in claude_branches:
                self._log(f"  → {b}", "yellow")

            # Find the branch with the latest commit
            latest_branch = None
            latest_timestamp = 0

            for branch in claude_branches:
                ret, ts = self._run_cmd(
                    ["git", "log", "-1", "--format=%ct", branch], cwd=path
                )
                if ret == 0 and ts.strip():
                    try:
                        t = int(ts.strip().splitlines()[-1])
                        if t > latest_timestamp:
                            latest_timestamp = t
                            latest_branch = branch
                    except ValueError:
                        pass

            if not latest_branch:
                self._log("Could not determine latest branch.", "red")
                self._set_status("MERGE FAILED", RED)
                return

            self._log(f"\nLatest branch: {latest_branch}", "cyan")
            self._log("Merging with strategy: overwrite main with branch content...", "magenta")

            # Merge using theirs strategy — branch content overwrites main
            ret, _ = self._run_cmd(
                ["git", "merge", latest_branch, "-X", "theirs", "--no-edit",
                 "-m", f"Merge {latest_branch} into main (auto-launcher)"],
                cwd=path
            )

            if ret != 0:
                self._log("Standard merge failed, trying force checkout merge...", "yellow")
                # Nuclear option: reset main to the branch content
                local_branch = latest_branch.replace("origin/", "")
                self._run_cmd(["git", "checkout", latest_branch, "--", "."], cwd=path)
                self._run_cmd(["git", "add", "-A"], cwd=path)
                self._run_cmd(
                    ["git", "commit", "-m",
                     f"Merge {latest_branch} into main (overwrite)"],
                    cwd=path
                )

            # Push to remote
            ret, _ = self._run_cmd(["git", "push", "origin", "main"], cwd=path)
            if ret == 0:
                self._log("Merge complete! Main is updated.", "green")
                self._set_status("MERGED", GREEN)
            else:
                self._log("Push failed — you may need to push manually.", "yellow")
                self._set_status("MERGED (NOT PUSHED)", YELLOW)

        self._threaded(task)

    # ── Install ────────────────────────────────────────
    def _install_deps(self):
        def task():
            path = self._get_path()
            if not path or not os.path.isfile(os.path.join(path, "package.json")):
                self._log("ERROR: Repo not found or no package.json.", "red")
                return

            self._set_status("INSTALLING...", YELLOW)
            self._log("═" * 50, "yellow")
            self._log("INSTALLING NPM DEPENDENCIES...", "yellow")

            ret, _ = self._run_cmd(["npm", "install"], cwd=path)
            if ret == 0:
                self._log("Dependencies installed!", "green")
                self._set_status("INSTALLED", GREEN)
            else:
                self._log("Install failed!", "red")
                self._set_status("INSTALL FAILED", RED)

        self._threaded(task)

    # ── Run Dev ────────────────────────────────────────
    def _run_dev(self):
        def task():
            path = self._get_path()
            if not path or not os.path.isfile(os.path.join(path, "package.json")):
                self._log("ERROR: Repo not found.", "red")
                return

            self._set_status("RUNNING DEV SERVER...", GREEN)
            self._log("═" * 50, "green")
            self._log("STARTING TAURI DEV MODE...", "green")

            ret, _ = self._run_cmd(["npm", "run", "tauri", "dev"], cwd=path)
            if ret == 0:
                self._set_status("DEV SERVER STOPPED", DIM)
            else:
                self._set_status("DEV SERVER EXITED", YELLOW)

        self._threaded(task)

    # ── Build Release ──────────────────────────────────
    def _build_release(self):
        def task():
            path = self._get_path()
            if not path or not os.path.isfile(os.path.join(path, "package.json")):
                self._log("ERROR: Repo not found.", "red")
                return

            self._set_status("BUILDING RELEASE...", MAGENTA)
            self._log("═" * 50, "magenta")
            self._log("BUILDING RELEASE BINARY...", "magenta")
            self._log("This may take several minutes...", "yellow")

            ret, _ = self._run_cmd(["npm", "run", "tauri", "build"], cwd=path)
            if ret == 0:
                self._log("Build complete! Check src-tauri/target/release/", "green")
                self._set_status("BUILD COMPLETE", GREEN)
            else:
                self._log("Build failed!", "red")
                self._set_status("BUILD FAILED", RED)

        self._threaded(task)

    # ── Stop ───────────────────────────────────────────
    def _stop_process(self):
        proc = getattr(self, "_current_proc", None)
        if proc and proc.poll() is None:
            proc.terminate()
            self._log("Process terminated.", "red")
            self._set_status("STOPPED", RED)
        else:
            self._log("No running process to stop.", "yellow")

    # ── Run ────────────────────────────────────────────
    def run(self):
        self._log("◆ CyberVault Launcher initialized", "cyan")
        self._log(f"  Repo URL: {REPO_URL}", "cyan")
        path = self.repo_path.get()
        if path and os.path.isdir(os.path.join(path, ".git")):
            self._log(f"  Repo found: {path}", "green")
        else:
            self._log(f"  Default path: {path}", "yellow")
            self._log("  Repo not cloned yet — click CLONE REPO to get started", "yellow")
        self._log("═" * 50, "cyan")
        self.root.mainloop()


if __name__ == "__main__":
    CyberVaultLauncher().run()
