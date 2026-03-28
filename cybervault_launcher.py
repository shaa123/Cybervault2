"""
CyberVault Launcher — Cyberpunk-themed Python GUI
Merges all Claude branches into main, clones repo if needed,
installs dependencies, and runs dev/build modes.
"""

import tkinter as tk
from tkinter import scrolledtext, filedialog, messagebox
import subprocess
import threading
import shutil
import os
import sys

REPO_URL = "https://github.com/shaa123/Cybervault2.git"
REPO_NAME = "Cybervault2"

# On Windows, commands like npm/git need shell=True to find .cmd/.exe
IS_WIN = sys.platform == "win32"

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


def _find_cmd(name):
    """Find a command on PATH, then check common Windows install locations."""
    # 1) Try PATH first (with Windows extensions)
    for variant in [name] + ([name + ".cmd", name + ".exe", name + ".bat"] if IS_WIN else []):
        found = shutil.which(variant)
        if found:
            return found

    # 2) On Windows, scan common install directories
    if IS_WIN:
        search_dirs = []
        program_files = os.environ.get("ProgramFiles", r"C:\Program Files")
        program_files_x86 = os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)")
        appdata = os.environ.get("APPDATA", "")
        localappdata = os.environ.get("LOCALAPPDATA", "")

        if name == "npm":
            # Node.js / npm common locations
            search_dirs = [
                os.path.join(program_files, "nodejs"),
                os.path.join(program_files_x86, "nodejs"),
                os.path.join(appdata, "npm"),
                os.path.join(localappdata, "fnm_multishells"),  # fnm
                os.path.join(os.path.expanduser("~"), ".nvm"),  # nvm-windows
                os.path.join(program_files, "nvm"),
            ]
            # Also check nvm-windows installed versions
            nvm_home = os.environ.get("NVM_HOME", os.path.join(program_files, "nvm"))
            if os.path.isdir(nvm_home):
                try:
                    for d in os.listdir(nvm_home):
                        full = os.path.join(nvm_home, d)
                        if os.path.isdir(full) and d.startswith("v"):
                            search_dirs.append(full)
                except OSError:
                    pass
            # nvm symlink directory
            nvm_symlink = os.environ.get("NVM_SYMLINK", os.path.join(program_files, "nodejs"))
            search_dirs.append(nvm_symlink)

        elif name == "git":
            search_dirs = [
                os.path.join(program_files, "Git", "cmd"),
                os.path.join(program_files, "Git", "bin"),
                os.path.join(program_files_x86, "Git", "cmd"),
                os.path.join(localappdata, "Programs", "Git", "cmd"),
            ]

        elif name == "cargo":
            search_dirs = [
                os.path.join(os.path.expanduser("~"), ".cargo", "bin"),
                os.path.join(os.path.expanduser("~"), ".rustup", "toolchains"),
            ]

        for d in search_dirs:
            if not os.path.isdir(d):
                continue
            for ext in [".cmd", ".exe", ".bat", ""]:
                candidate = os.path.join(d, name + ext)
                if os.path.isfile(candidate):
                    return candidate

    return None  # not found


GIT = _find_cmd("git")
NPM = _find_cmd("npm")
CARGO = _find_cmd("cargo")


class CyberVaultLauncher:
    def __init__(self):
        self.root = tk.Tk()
        self.root.title("CyberVault Launcher")
        self.root.geometry("780x620")
        self.root.configure(bg=BG)
        self.root.resizable(True, True)

        self.repo_path = tk.StringVar(value=self._find_repo())
        self.running = False
        self._current_proc = None

        self._build_ui()

    # ── Locate repo ────────────────────────────────────
    def _find_repo(self):
        """Check common locations for the cloned repo. If not found, default to Desktop."""
        # Check if we're inside the repo already
        cwd = os.getcwd()
        if os.path.isdir(os.path.join(cwd, ".git")):
            if os.path.basename(os.path.abspath(cwd)) == REPO_NAME:
                return cwd

        candidates = [
            os.path.join(cwd, REPO_NAME),
            os.path.join(os.path.expanduser("~"), REPO_NAME),
            os.path.join(os.path.expanduser("~"), "Desktop", REPO_NAME),
            os.path.join(os.path.expanduser("~"), "Documents", REPO_NAME),
            os.path.join(os.path.expanduser("~"), "Projects", REPO_NAME),
            os.path.join(os.path.expanduser("~"), "Downloads", REPO_NAME),
        ]
        for c in candidates:
            if os.path.isdir(os.path.join(c, ".git")):
                return c

        # Not found anywhere — pick a sensible default
        desktop = os.path.join(os.path.expanduser("~"), "Desktop")
        if os.path.isdir(desktop):
            return os.path.join(desktop, REPO_NAME)
        return os.path.join(os.path.expanduser("~"), REPO_NAME)

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
            ("⬡  CLONE / PULL",      CYAN,    self._clone_repo,      0, 0),
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
        d = filedialog.askdirectory(title="Select folder where CyberVault2 is (or will be cloned)")
        if d:
            # Smart detection: did they pick the repo itself or a parent?
            if os.path.basename(d) == REPO_NAME:
                self.repo_path.set(d)
            elif os.path.isdir(os.path.join(d, REPO_NAME, ".git")):
                self.repo_path.set(os.path.join(d, REPO_NAME))
            else:
                self.repo_path.set(os.path.join(d, REPO_NAME))

    def _require_path(self, need_repo=True):
        """Get and validate the repo path. MUST be called from main thread.
        Opens folder picker if path is empty. Returns path or None."""
        p = self.repo_path.get().strip()

        # If empty, open folder picker
        if not p:
            chosen = filedialog.askdirectory(
                title="Pick the folder where CyberVault2 is (or should be cloned)"
            )
            if not chosen:
                self._log("Cancelled — no folder selected.", "yellow")
                return None
            if os.path.basename(chosen) == REPO_NAME:
                p = chosen
            else:
                p = os.path.join(chosen, REPO_NAME)
            self.repo_path.set(p)

        # Check repo exists if needed
        if need_repo and not os.path.isdir(os.path.join(p, ".git")):
            self._log(f"Repo not found at: {p}", "red")
            self._log("Click CLONE REPO first to download it.", "yellow")
            return None

        return p

    def _run_cmd(self, cmd, cwd=None):
        """Run a command, stream output to log. Returns (returncode, full_output).
        Uses shell=True on Windows so .cmd/.bat executables are found."""
        # Check if the command binary was resolved
        exe = cmd[0] if isinstance(cmd, list) else cmd.split()[0]
        if exe is None or (not os.path.isfile(exe) and not shutil.which(exe)):
            name = os.path.basename(exe) if exe else "unknown"
            self.root.after(0, self._log, f"ERROR: '{name}' not found on this system!", "red")
            if "npm" in (name or ""):
                self.root.after(0, self._log, "  → Install Node.js from https://nodejs.org (LTS)", "yellow")
                self.root.after(0, self._log, "  → After install, RESTART this launcher", "yellow")
            elif "git" in (name or ""):
                self.root.after(0, self._log, "  → Install Git from https://git-scm.com", "yellow")
            elif "cargo" in (name or ""):
                self.root.after(0, self._log, "  → Install Rust from https://rustup.rs", "yellow")
            return 1, ""

        display = cmd if isinstance(cmd, str) else " ".join(cmd)
        self.root.after(0, self._log, f"$ {display}", "cyan")
        try:
            proc = subprocess.Popen(
                cmd, cwd=cwd, shell=IS_WIN,
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
            name = cmd[0] if isinstance(cmd, list) else cmd
            self.root.after(0, self._log, f"ERROR: '{name}' not found!", "red")
            self.root.after(0, self._log, "  → Make sure it's installed and restart the launcher", "yellow")
            return 1, ""
        except Exception as e:
            self.root.after(0, self._log, f"ERROR: {e}", "red")
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

    # ── Clone / Pull ─────────────────────────────────
    def _clone_repo(self):
        # _require_path on main thread (no need_repo — we might be cloning)
        path = self._require_path(need_repo=False)
        if not path:
            return

        already_cloned = os.path.isdir(os.path.join(path, ".git"))

        def task():
            if already_cloned:
                # Repo exists — discard build artifacts, pull latest
                self.root.after(0, self._set_status, "PULLING...", CYAN)
                self.root.after(0, self._log, "═" * 50, "cyan")
                self.root.after(0, self._log, f"PULLING LATEST FROM: {path}", "cyan")

                # Reset any local modifications (build artifacts, generated files)
                self._run_cmd([GIT, "checkout", "--", "."], cwd=path)
                self._run_cmd([GIT, "checkout", "main"], cwd=path)
                ret, _ = self._run_cmd([GIT, "pull", "origin", "main"], cwd=path)

                if ret == 0:
                    self.root.after(0, self._log, "Pull complete! You have the latest code.", "green")
                    self.root.after(0, self._set_status, "UP TO DATE", GREEN)
                else:
                    self.root.after(0, self._log, "Pull failed!", "red")
                    self.root.after(0, self._set_status, "PULL FAILED", RED)
            else:
                # Repo doesn't exist — clone it
                parent_dir = os.path.dirname(path)
                if parent_dir and not os.path.isdir(parent_dir):
                    os.makedirs(parent_dir, exist_ok=True)

                self.root.after(0, self._set_status, "CLONING...", CYAN)
                self.root.after(0, self._log, "═" * 50, "cyan")
                self.root.after(0, self._log, f"CLONING INTO: {path}", "cyan")

                ret, _ = self._run_cmd([GIT, "clone", REPO_URL, path])
                if ret == 0:
                    self.root.after(0, self._log, "Clone complete!", "green")
                    self.root.after(0, self._set_status, "CLONED", GREEN)
                else:
                    self.root.after(0, self._log, "Clone failed!", "red")
                    self.root.after(0, self._set_status, "CLONE FAILED", RED)

        self._threaded(task)

    # ── Merge all Claude branches ──────────────────────
    def _merge_branches(self):
        # Validate path on main thread first
        path = self._require_path(need_repo=True)
        if not path:
            return

        def task():
            self.root.after(0, self._set_status, "MERGING BRANCHES...", MAGENTA)
            self.root.after(0, self._log, "═" * 50, "magenta")
            self.root.after(0, self._log, "FETCHING ALL REMOTE BRANCHES...", "magenta")

            self._run_cmd([GIT, "fetch", "--all"], cwd=path)
            self._run_cmd([GIT, "checkout", "main"], cwd=path)
            self._run_cmd([GIT, "pull", "origin", "main"], cwd=path)

            # List all remote claude/* branches
            ret, output = self._run_cmd([GIT, "branch", "-r"], cwd=path)
            if ret != 0:
                self.root.after(0, self._log, "Failed to list branches.", "red")
                self.root.after(0, self._set_status, "MERGE FAILED", RED)
                return

            claude_branches = []
            for line in output.splitlines():
                line = line.strip()
                if "claude/" in line and "HEAD" not in line:
                    claude_branches.append(line)

            if not claude_branches:
                self.root.after(0, self._log, "No Claude branches found. Main is up to date.", "green")
                self.root.after(0, self._set_status, "NOTHING TO MERGE", GREEN)
                return

            self.root.after(0, self._log, f"Found {len(claude_branches)} Claude branch(es):", "magenta")
            for b in claude_branches:
                self.root.after(0, self._log, f"  → {b}", "yellow")

            # Find the branch with the latest commit
            latest_branch = None
            latest_timestamp = 0

            for branch in claude_branches:
                ret, ts = self._run_cmd(
                    [GIT, "log", "-1", "--format=%ct", branch], cwd=path
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
                self.root.after(0, self._log, "Could not determine latest branch.", "red")
                self.root.after(0, self._set_status, "MERGE FAILED", RED)
                return

            # Check if the branch is actually ahead of main
            ret, ahead = self._run_cmd(
                [GIT, "rev-list", "--count", "main.." + latest_branch], cwd=path
            )
            ahead_count = 0
            if ret == 0:
                try:
                    ahead_count = int(ahead.strip().splitlines()[-1])
                except (ValueError, IndexError):
                    pass

            if ahead_count == 0:
                self.root.after(0, self._log, f"\n{latest_branch} is already merged into main.", "green")
                self.root.after(0, self._log, "Nothing to merge — main is up to date.", "green")
                self.root.after(0, self._set_status, "ALREADY UP TO DATE", GREEN)
                return

            self.root.after(0, self._log, f"\nLatest branch: {latest_branch} ({ahead_count} commits ahead)", "cyan")
            self.root.after(0, self._log, "Merging new commits into main...", "magenta")

            # Standard merge (main stays authoritative, branch adds new stuff)
            ret, _ = self._run_cmd(
                [GIT, "merge", latest_branch, "--no-edit",
                 "-m", f"Merge {latest_branch} into main (auto-launcher)"],
                cwd=path
            )

            if ret != 0:
                self.root.after(0, self._log, "Merge conflict — keeping main's version of conflicting files...", "yellow")
                self._run_cmd([GIT, "merge", "--abort"], cwd=path)
                # Retry with ours strategy — main wins on conflicts, branch adds new files
                self._run_cmd(
                    [GIT, "merge", latest_branch, "-X", "ours", "--no-edit",
                     "-m", f"Merge {latest_branch} into main (auto-launcher)"],
                    cwd=path
                )

            # Push to remote
            ret, _ = self._run_cmd([GIT, "push", "origin", "main"], cwd=path)
            if ret == 0:
                # Clean up: delete the merged remote branch so it doesn't get re-merged
                self.root.after(0, self._log, "Cleaning up merged branch...", "magenta")
                remote_name = latest_branch.replace("origin/", "")
                self._run_cmd([GIT, "push", "origin", "--delete", remote_name], cwd=path)
                self.root.after(0, self._log, "Merge complete! Main is updated.", "green")
                self.root.after(0, self._set_status, "MERGED", GREEN)
            else:
                self.root.after(0, self._log, "Push failed — you may need to push manually.", "yellow")
                self.root.after(0, self._set_status, "MERGED (NOT PUSHED)", YELLOW)

        self._threaded(task)

    # ── Install ────────────────────────────────────────
    def _install_deps(self):
        path = self._require_path(need_repo=True)
        if not path:
            return

        def task():
            self.root.after(0, self._set_status, "INSTALLING...", YELLOW)
            self.root.after(0, self._log, "═" * 50, "yellow")
            self.root.after(0, self._log, "INSTALLING ALL DEPENDENCIES (npm + tauri cli)...", "yellow")

            ret, _ = self._run_cmd([NPM, "install"], cwd=path)
            if ret == 0:
                self.root.after(0, self._log, "All dependencies installed!", "green")
                self.root.after(0, self._log, "Tauri CLI installed via @tauri-apps/cli npm package.", "green")
                self.root.after(0, self._set_status, "INSTALLED", GREEN)
            else:
                self.root.after(0, self._log, "npm install failed!", "red")
                self.root.after(0, self._set_status, "INSTALL FAILED", RED)

        self._threaded(task)

    def _auto_npm_install(self, path):
        """Auto-run npm install if node_modules is missing. Returns True if ready."""
        nm = os.path.join(path, "node_modules")
        if os.path.isdir(nm):
            return True
        self.root.after(0, self._log, "node_modules not found — running npm install first...", "yellow")
        ret, _ = self._run_cmd([NPM, "install"], cwd=path)
        if ret != 0:
            self.root.after(0, self._log, "npm install failed! Run INSTALL DEPS manually.", "red")
            return False
        self.root.after(0, self._log, "Dependencies installed.", "green")
        return True

    # ── Run Dev ────────────────────────────────────────
    def _run_dev(self):
        path = self._require_path(need_repo=True)
        if not path:
            return

        def task():
            if not self._auto_npm_install(path):
                self.root.after(0, self._set_status, "INSTALL FAILED", RED)
                return

            self.root.after(0, self._set_status, "RUNNING DEV SERVER...", GREEN)
            self.root.after(0, self._log, "═" * 50, "green")
            self.root.after(0, self._log, "STARTING TAURI DEV MODE...", "green")

            ret, _ = self._run_cmd([NPM, "run", "tauri", "dev"], cwd=path)
            if ret == 0:
                self.root.after(0, self._set_status, "DEV SERVER STOPPED", DIM)
            else:
                self.root.after(0, self._set_status, "DEV SERVER EXITED", YELLOW)

        self._threaded(task)

    # ── Build Release ──────────────────────────────────
    def _build_release(self):
        path = self._require_path(need_repo=True)
        if not path:
            return

        def task():
            if not self._auto_npm_install(path):
                self.root.after(0, self._set_status, "INSTALL FAILED", RED)
                return

            self.root.after(0, self._set_status, "BUILDING RELEASE...", MAGENTA)
            self.root.after(0, self._log, "═" * 50, "magenta")
            self.root.after(0, self._log, "BUILDING RELEASE BINARY...", "magenta")
            self.root.after(0, self._log, "This will take 5-15 minutes on first build...", "yellow")
            self.root.after(0, self._log, "", None)

            # Check for Rust/Cargo
            if not CARGO:
                self.root.after(0, self._log, "ERROR: Rust/Cargo not found!", "red")
                self.root.after(0, self._log, "  → Install Rust from https://rustup.rs", "yellow")
                self.root.after(0, self._log, "  → Then restart this launcher", "yellow")
                self.root.after(0, self._set_status, "BUILD FAILED — NO RUST", RED)
                return

            ret, output = self._run_cmd([NPM, "run", "tauri", "build"], cwd=path)
            if ret == 0:
                # Find the built executable
                release_dir = os.path.join(path, "src-tauri", "target", "release")
                bundle_dir = os.path.join(release_dir, "bundle")

                self.root.after(0, self._log, "", None)
                self.root.after(0, self._log, "═" * 50, "green")
                self.root.after(0, self._log, "BUILD COMPLETE!", "green")
                self.root.after(0, self._log, "", None)

                # Check for exe
                exe_path = os.path.join(release_dir, "cybervault2.exe" if IS_WIN else "cybervault2")
                if os.path.isfile(exe_path):
                    size_mb = os.path.getsize(exe_path) / (1024 * 1024)
                    self.root.after(0, self._log, f"  EXE: {exe_path}", "cyan")
                    self.root.after(0, self._log, f"  Size: {size_mb:.1f} MB", "cyan")

                # Check for installer bundles
                if os.path.isdir(bundle_dir):
                    for root_dir, dirs, files in os.walk(bundle_dir):
                        for f in files:
                            if f.endswith((".msi", ".exe", ".nsis", ".deb", ".AppImage", ".dmg")):
                                fp = os.path.join(root_dir, f)
                                size_mb = os.path.getsize(fp) / (1024 * 1024)
                                self.root.after(0, self._log, f"  INSTALLER: {fp}", "cyan")
                                self.root.after(0, self._log, f"  Size: {size_mb:.1f} MB", "cyan")

                self.root.after(0, self._log, "", None)
                self.root.after(0, self._log, "You can distribute the installer to users.", "green")
                self.root.after(0, self._set_status, "BUILD COMPLETE", GREEN)
            else:
                self.root.after(0, self._log, "", None)
                self.root.after(0, self._log, "Build failed! Common fixes:", "red")
                self.root.after(0, self._log, "  → Install Visual Studio C++ Build Tools", "yellow")
                self.root.after(0, self._log, "  → Install Rust: https://rustup.rs", "yellow")
                self.root.after(0, self._log, "  → Run: rustup update", "yellow")
                self.root.after(0, self._set_status, "BUILD FAILED", RED)

        self._threaded(task)

    # ── Stop ───────────────────────────────────────────
    def _stop_process(self):
        proc = self._current_proc
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
        self._log("", None)

        # Show tool status
        self._log("  SYSTEM CHECK:", "cyan")
        if GIT:
            self._log(f"  ✓ Git:   {GIT}", "green")
        else:
            self._log("  ✗ Git:   NOT FOUND — install from https://git-scm.com", "red")

        if NPM:
            self._log(f"  ✓ npm:   {NPM}", "green")
        else:
            self._log("  ✗ npm:   NOT FOUND — install Node.js from https://nodejs.org", "red")
            self._log("           Download the LTS version, install it, then RESTART this launcher", "yellow")

        if CARGO:
            self._log(f"  ✓ Cargo: {CARGO}", "green")
        else:
            self._log("  ✗ Cargo: NOT FOUND — install Rust from https://rustup.rs (needed for build)", "yellow")

        self._log("", None)

        path = self.repo_path.get()
        if path and os.path.isdir(os.path.join(path, ".git")):
            self._log(f"  Repo found: {path}", "green")
        else:
            self._log(f"  Clone path: {path}", "yellow")
            self._log("  Click CLONE REPO to download the repository", "yellow")
        self._log("═" * 50, "cyan")
        self.root.mainloop()


if __name__ == "__main__":
    CyberVaultLauncher().run()
