"use client";

import React, { useState, useEffect } from "react";

const THRESHOLD_BYTES = 108 * 1000 * 1000; // 108 MB
const DURATION_PER_FILE_HOURS = 3 / 60; // 3 minutes

interface SessionRow {
  id: number;
  good: number;
  bad: number;
  total: number;
  eff: string;
}

export default function Home() {
  const [sessionData, setSessionData] = useState<SessionRow[]>([]);
  const [cardCounter, setCardCounter] = useState(0);
  const [status, setStatus] = useState({ text: "Ready to Start", type: "idle" });
  const [isScanning, setIsScanning] = useState(false);
  const [currentStats, setCurrentStats] = useState({ good: 0, bad: 0, total: 0 });

  // Averages
  const [averages, setAverages] = useState({ good: 0, bad: 0, total: 0, eff: "0%" });

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

  const analyzeDirectory = async (dirHandle: any) => {
    let videoFolder = null;

    async function findVideoFolder(handle: any): Promise<any> {
      for await (const entry of handle.values()) {
        if (entry.kind === "directory") {
          if (entry.name.toLowerCase() === "dvr") {
            for await (const subEntry of entry.values()) {
              if (subEntry.kind === "directory" && subEntry.name.toLowerCase() === "video") {
                return subEntry;
              }
            }
          }
          const found = await findVideoFolder(entry);
          if (found) return found;
        }
      }
      return null;
    }

    videoFolder = await findVideoFolder(dirHandle);
    if (!videoFolder) return { error: "No DVR/VIDEO folder found." };

    let goodCount = 0;
    let badCount = 0;

    for await (const entry of videoFolder.values()) {
      if (entry.kind === "file" && entry.name.toLowerCase().endsWith(".mp4")) {
        const file = await entry.getFile();
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
    };
  };

  const handleScan = async () => {
    try {
      if (!(window as any).showDirectoryPicker) {
        alert("Your browser is too old. Please use Brave, Chrome, or Edge for this tool.");
        return;
      }

      const dirHandle = await (window as any).showDirectoryPicker();
      setIsScanning(true);
      setStatus({ text: "Scanning Card...", type: "scanning" });

      const result: any = await analyzeDirectory(dirHandle);

      if (result.error) {
        setStatus({ text: result.error, type: "error" });
      } else {
        const newId = cardCounter + 1;
        setCardCounter(newId);
        setCurrentStats({ good: result.good, bad: result.bad, total: result.total });

        const efficiency = ((result.good / result.total) * 100).toFixed(1);
        const newRow: SessionRow = {
          id: newId,
          good: result.good,
          bad: result.bad,
          total: result.total,
          eff: efficiency,
        };

        setSessionData((prev) => [...prev, newRow]);
        setStatus({ text: "Scan Complete", type: "success" });
      }
    } catch (err: any) {
      console.error(err);
      if (err.name !== "AbortError") {
        setStatus({ text: "Access Denied", type: "error" });
      }
    } finally {
      setIsScanning(false);
    }
  };

  const handleReset = () => {
    setSessionData([]);
    setCardCounter(0);
    setStatus({ text: "Ready to Start", type: "idle" });
    setCurrentStats({ good: 0, bad: 0, total: 0 });
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#000000] p-10 flex flex-col items-center font-['Outfit'] antialiased">
      <div className="w-full max-w-4xl animate-in fade-in slide-in-from-bottom-2 duration-700">
        <header className="text-center mb-10">
          <h1 className="text-4xl font-bold tracking-tighter uppercase mb-3">Build.AI</h1>
          <div
            className={`inline-block px-4 py-1.5 rounded-full font-semibold text-sm transition-all duration-300 ${
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
        <div className="flex flex-col items-center gap-4 mb-10">
          <button
            onClick={handleScan}
            disabled={isScanning}
            className="flex items-center gap-2 bg-black text-white px-8 py-4 rounded-xl text-lg font-semibold shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-70"
          >
            <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M12 4v16m8-8H4"></path>
            </svg>
            Scan SD Card
          </button>
          
          {sessionData.length > 0 && (
            <button
              onClick={handleReset}
              className="px-5 py-2 text-sm font-semibold text-[#555] hover:text-black transition-colors"
            >
              End Calculation & Clear
            </button>
          )}
        </div>

        {/* Session Table */}
        {sessionData.length > 0 && (
          <div className="bg-white rounded-2xl border border-[#E9ECEF] overflow-hidden shadow-sm">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#F8F9FA]">
                  <th className="p-4 text-xs font-bold text-[#6C757D] uppercase border-bottom border-[#E9ECEF]">Card #</th>
                  <th className="p-4 text-xs font-bold text-[#6C757D] uppercase border-bottom border-[#E9ECEF]">Good (h)</th>
                  <th className="p-4 text-xs font-bold text-[#6C757D] uppercase border-bottom border-[#E9ECEF]">Bad (h)</th>
                  <th className="p-4 text-xs font-bold text-[#6C757D] uppercase border-bottom border-[#E9ECEF]">Total (h)</th>
                  <th className="p-4 text-xs font-bold text-[#6C757D] uppercase border-bottom border-[#E9ECEF]">Efficiency</th>
                </tr>
              </thead>
              <tbody>
                {sessionData.map((row) => (
                  <tr key={row.id} className="border-b border-[#E9ECEF] last:border-0">
                    <td className="p-4 font-medium">{row.id}</td>
                    <td className="p-4 text-[#28A745] font-semibold">{row.good.toFixed(2)}</td>
                    <td className="p-4 text-[#DC3545] font-semibold">{row.bad.toFixed(2)}</td>
                    <td className="p-4 text-[#D4A017] font-semibold">{row.total.toFixed(2)}</td>
                    <td className="p-4">{row.eff}%</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-[#F8F9FA] font-bold">
                  <td className="p-4 text-xs text-[#000] uppercase">AVERAGES</td>
                  <td className="p-4 text-black">{averages.good.toFixed(2)}</td>
                  <td className="p-4 text-black">{averages.bad.toFixed(2)}</td>
                  <td className="p-4 text-black">{averages.total.toFixed(2)}</td>
                  <td className="p-4 text-black">{averages.eff}</td>
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
