"use client";

import React, { useState, useEffect, useRef } from "react";

const THRESHOLD_BYTES = 108 * 1000 * 1000; // 108 MB
const DURATION_PER_FILE_HOURS = 3 / 60; // 3 minutes

interface SessionRow {
  id: number;
  good: number;
  bad: number;
  total: number;
  eff: string;
  name: string;
}

export default function Home() {
  const [sessionData, setSessionData] = useState<SessionRow[]>([]);
  const [cardCounter, setCardCounter] = useState(0);
  const [status, setStatus] = useState({ text: "Ready to Start", type: "idle" });
  const [isScanning, setIsScanning] = useState(false);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [currentStats, setCurrentStats] = useState({ good: 0, bad: 0, total: 0 });
  const [averages, setAverages] = useState({ good: 0, bad: 0, total: 0, eff: "0%" });

  // Refs for monitoring state to avoid closure issues in setInterval
  const lastScanRef = useRef<string>("");
  const isMonitoringRef = useRef(false);
  const monitorHandleRef = useRef<any>(null);

  useEffect(() => {
    if (sessionData.length === 0) {
      setAverages({ good: 0, bad: 0, total: 0, eff: "0%" });
      return;
    }

    const count = sessionData.length;
    const sumGood = sessionData.reduce((s, d) => s + d.good, 0);
    const sumBad = sessionData.reduce((s, d) => s + d.bad, 0);
    const sumTotal = sessionData.reduce((s, d) => s + d.total, 0);

    setAverages({
      good: sumGood / count,
      bad: sumBad / count,
      total: sumTotal / count,
      eff: ((sumGood / sumTotal) * 100).toFixed(1) + "%",
    });
  }, [sessionData]);

  // The Monitoring Loop
  useEffect(() => {
    let interval: any;
    if (isMonitoring) {
      interval = setInterval(async () => {
        if (monitorHandleRef.current) {
          await runAutoScan(monitorHandleRef.current);
        }
      }, 3000); // Check every 3 seconds
    }
    return () => clearInterval(interval);
  }, [isMonitoring]);

  const runAutoScan = async (dirHandle: any) => {
    // Only auto-scan if not already busy
    if (isScanning) return;

    const result: any = await analyzeDirectory(dirHandle);
    
    // If we found a valid card and it's DIFFERENT from the last one we scanned
    if (!result.error && result.signature !== lastScanRef.current) {
      lastScanRef.current = result.signature;
      processScanResult(result);
    } 
    // If card was removed
    else if (result.error && lastScanRef.current !== "") {
      lastScanRef.current = "";
      setStatus({ text: "Card Removed. Waiting for next...", type: "idle" });
    }
  };

  const analyzeDirectory = async (dirHandle: any) => {
    let videoFolder = null;
    let foundName = "";

    async function findVideoFolder(handle: any): Promise<any> {
      for await (const entry of handle.values()) {
        if (entry.kind === "directory") {
          if (entry.name.toLowerCase() === "dvr") {
            for await (const subEntry of entry.values()) {
              if (subEntry.kind === "directory" && subEntry.name.toLowerCase() === "video") {
                foundName = handle.name;
                return subEntry;
              }
            }
          }
          // Also check inside subdirectories (up to 2 levels deep)
          const found = await findVideoFolder(entry);
          if (found) return found;
        }
      }
      return null;
    }

    try {
      videoFolder = await findVideoFolder(dirHandle);
      if (!videoFolder) return { error: "No DVR/VIDEO folder found." };

      let goodCount = 0;
      let badCount = 0;
      let fileSignature = "";

      for await (const entry of videoFolder.values()) {
        if (entry.kind === "file" && entry.name.toLowerCase().endsWith(".mp4")) {
          const file = await entry.getFile();
          fileSignature += `${file.name}-${file.size}`;
          if (file.size >= THRESHOLD_BYTES) {
            goodCount++;
          } else {
            badCount++;
          }
        }
      }

      if (goodCount + badCount === 0) return { error: "No .mp4 files found." };

      return {
        good: goodCount * DURATION_PER_FILE_HOURS,
        bad: badCount * DURATION_PER_FILE_HOURS,
        total: (goodCount + badCount) * DURATION_PER_FILE_HOURS,
        clips: goodCount + badCount,
        signature: fileSignature, // Unique ID for this specific set of files
        name: foundName
      };
    } catch (e) {
      return { error: "Access lost. Re-select folder." };
    }
  };

  const processScanResult = (result: any) => {
    const newId = cardCounter + 1;
    setCardCounter(newId);
    setCurrentStats({ good: result.good, bad: result.bad, total: result.total });

    const efficiency = ((result.good / result.total) * 100).toFixed(1);
    const newRow: SessionRow = {
      id: newId,
      name: result.name || `Card ${newId}`,
      good: result.good,
      bad: result.bad,
      total: result.total,
      eff: efficiency,
    };

    setSessionData((prev) => [...prev, newRow]);
    setStatus({ text: `Auto-Scan Complete: ${result.name}`, type: "success" });
  };

  const handleManualScan = async () => {
    try {
      if (!(window as any).showDirectoryPicker) {
        alert("Your browser is too old. Please use Brave, Chrome, or Edge.");
        return;
      }

      const h = await (window as any).showDirectoryPicker();
      setIsScanning(true);
      setStatus({ text: "Scanning Card...", type: "scanning" });

      const result: any = await analyzeDirectory(h);
      if (result.error) {
        setStatus({ text: result.error, type: "error" });
      } else {
        processScanResult(result);
      }
    } catch (err: any) {
      if (err.name !== "AbortError") setStatus({ text: "Scan Blocked", type: "error" });
    } finally {
      setIsScanning(false);
    }
  };

  const toggleMonitor = async () => {
    if (isMonitoring) {
      setIsMonitoring(false);
      isMonitoringRef.current = false;
      setStatus({ text: "Monitor Mode Off", type: "idle" });
      return;
    }

    try {
      // ON MAC: People should select their /Volumes folder
      // ON WINDOWS: People should select their "Computer" or Drive root
      alert("Senior Pro Tip: Select your '/Volumes' (Mac) or 'Drives' (Win) folder to enable automatic SD card detection.");
      const h = await (window as any).showDirectoryPicker();
      monitorHandleRef.current = h;
      setIsMonitoring(true);
      isMonitoringRef.current = true;
      setStatus({ text: "LIVE MONITORING ACTIVE (Waiting for SD Card...)", type: "scanning" });
    } catch (err: any) {
      if (err.name !== "AbortError") alert("Permission failed. Manual scan only.");
    }
  };

  const handleReset = () => {
    setSessionData([]);
    setCardCounter(0);
    setStatus({ text: "Ready to Start", type: "idle" });
    setCurrentStats({ good: 0, bad: 0, total: 0 });
    lastScanRef.current = "";
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#000000] p-10 flex flex-col items-center font-['Outfit'] antialiased">
      <div className="w-full max-w-4xl">
        <header className="text-center mb-10">
          <h1 className="text-4xl font-bold tracking-tighter uppercase mb-3">Build.AI <span className="text-xs font-normal border border-black px-2 py-0.5 rounded ml-2">v2.0 Real-Time</span></h1>
          <div
            className={`inline-block px-4 py-1.5 rounded-full font-bold text-xs transition-all duration-300 ${
              status.type === "idle" ? "bg-[#E9ECEF] text-[#6C757D]" :
              status.type === "scanning" ? "bg-black text-white animate-pulse" :
              status.type === "success" ? "bg-[#D4EDDA] text-[#155724]" :
              "bg-[#F8D7DA] text-[#DC3545]"
            }`}
          >
            {status.text}
          </div>
        </header>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
          <StatCard label="Total Hours" value={currentStats.total.toFixed(2)} color="text-[#D4A017]" />
          <StatCard label="Good Hours" value={currentStats.good.toFixed(2)} color="text-[#28A745]" />
          <StatCard label="Bad Hours" value={currentStats.bad.toFixed(2)} color="text-[#DC3545]" />
        </div>

        {/* Action Area */}
        <div className="flex flex-col items-center gap-6 mb-10">
          <div className="flex gap-4">
            <button
              onClick={handleManualScan}
              disabled={isScanning || isMonitoring}
              className="px-8 py-4 bg-white border border-black font-bold uppercase text-sm tracking-widest hover:bg-black hover:text-white transition-all disabled:opacity-30"
            >
              Manual Scan
            </button>
            <button
              onClick={toggleMonitor}
              className={`px-8 py-4 font-bold border-2 uppercase text-sm tracking-widest transition-all ${
                isMonitoring 
                ? "bg-red-500 border-red-500 text-white hover:bg-red-700" 
                : "bg-black border-black text-white hover:bg-[#333]"
              }`}
            >
              {isMonitoring ? "⏹ Stop Monitoring" : "⚡️ Enable Auto-Discovery"}
            </button>
          </div>
          
          {sessionData.length > 0 && (
            <button onClick={handleReset} className="text-[10px] font-bold text-gray-400 hover:text-black uppercase tracking-widest">
              Clear All Data
            </button>
          )}
        </div>

        {/* Session Table */}
        {sessionData.length > 0 && (
          <div className="bg-white rounded-2xl border border-[#E9ECEF] overflow-hidden shadow-sm">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#F8F9FA]">
                  <th className="p-4 text-xs font-bold text-[#6C757D] uppercase border-b border-[#E9ECEF]">ID</th>
                  <th className="p-4 text-xs font-bold text-[#6C757D] uppercase border-b border-[#E9ECEF]">Source Name</th>
                  <th className="p-4 text-xs font-bold text-[#6C757D] uppercase border-b border-[#E9ECEF]">Good (h)</th>
                  <th className="p-4 text-xs font-bold text-[#6C757D] uppercase border-b border-[#E9ECEF]">Bad (h)</th>
                  <th className="p-4 text-xs font-bold text-[#6C757D] uppercase border-b border-[#E9ECEF]">Total (h)</th>
                  <th className="p-4 text-xs font-bold text-[#6C757D] uppercase border-b border-[#E9ECEF]">Eff</th>
                </tr>
              </thead>
              <tbody>
                {sessionData.map((row) => (
                  <tr key={row.id} className="border-b border-[#E9ECEF] last:border-0 hover:bg-gray-50 transition-colors">
                    <td className="p-4 font-bold">#{row.id}</td>
                    <td className="p-4 text-xs text-gray-500">{row.name}</td>
                    <td className="p-4 text-[#28A745] font-bold">{row.good.toFixed(2)}</td>
                    <td className="p-4 text-[#DC3545] font-bold">{row.bad.toFixed(2)}</td>
                    <td className="p-4 text-[#D4A017] font-bold">{row.total.toFixed(2)}</td>
                    <td className="p-4 font-mono text-xs">{row.eff}%</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-black text-white font-bold">
                  <td className="p-4 text-[10px] uppercase">AVERAGES</td>
                  <td></td>
                  <td className="p-4">{averages.good.toFixed(2)}</td>
                  <td className="p-4">{averages.bad.toFixed(2)}</td>
                  <td className="p-4">{averages.total.toFixed(2)}</td>
                  <td className="p-4 text-[#D4A017]">{averages.eff}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-white p-6 rounded-2xl border border-[#E9ECEF] text-center shadow-sm hover:translate-y-[-4px] hover:shadow-md transition-all duration-300">
      <div className={`text-3xl font-bold mb-1 ${color}`}>{value}</div>
      <div className="text-[10px] font-bold text-[#6C757D] uppercase tracking-wider">{label}</div>
    </div>
  );
}
