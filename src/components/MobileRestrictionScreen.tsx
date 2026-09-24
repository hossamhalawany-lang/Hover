import React, { useState, useEffect } from 'react';
import { Monitor, Smartphone, ShieldAlert, Laptop, RefreshCw, AlertOctagon } from 'lucide-react';

interface MobileRestrictionScreenProps {
  // Strict restriction with no bypass
}

export const MobileRestrictionScreen: React.FC<MobileRestrictionScreenProps> = () => {
  const [viewport, setViewport] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 0,
    height: typeof window !== 'undefined' ? window.innerHeight : 0
  });

  useEffect(() => {
    const handleResize = () => {
      setViewport({
        width: window.innerWidth,
        height: window.innerHeight
      });
    };
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  const handleRefresh = () => {
    window.location.reload();
  };

  return (
    <div
      id="mobile-restriction-screen"
      className="min-h-screen w-full bg-[#081320] text-slate-100 flex flex-col items-center justify-center p-4 sm:p-6 select-none"
    >
      {/* Background glow effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-rose-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 left-1/2 -translate-x-1/2 translate-y-1/2 w-96 h-96 bg-[#0F4C81]/20 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md bg-[#0F2236]/90 border border-slate-700/60 rounded-3xl shadow-2xl p-6 sm:p-8 backdrop-blur-xl text-center space-y-6 animate-in fade-in zoom-in-95 duration-200">
        {/* Device Restriction Icon Graphic */}
        <div className="flex items-center justify-center">
          <div className="relative">
            <div className="w-20 h-20 rounded-2xl bg-rose-950/80 border border-rose-800/80 flex items-center justify-center text-rose-400 shadow-inner">
              <Smartphone className="w-10 h-10 opacity-70" />
            </div>
            <div className="absolute -bottom-2 -right-2 p-2 rounded-xl bg-rose-600 text-white shadow-lg border-2 border-[#081320]">
              <AlertOctagon className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* Heading & Badges */}
        <div className="space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-semibold tracking-wide uppercase">
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>Access Restricted</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
            Desktop Workstation Required
          </h1>
          <p className="text-xs text-slate-400 leading-relaxed max-w-sm mx-auto">
            Hando Operations & Shift Handover Management is strictly restricted to desktop workstations and authorized enterprise terminals.
          </p>
        </div>

        {/* Policy / Reason Card */}
        <div className="p-4 rounded-2xl bg-[#0a1827] border border-slate-800 text-left space-y-2.5 text-xs">
          <div className="font-semibold text-slate-300 flex items-center gap-2">
            <Laptop className="w-4 h-4 text-sky-400" />
            <span>Operational Security Policy</span>
          </div>
          <p className="text-slate-400 leading-relaxed">
            Mobile access is disabled to prevent accidental status modifications, enforce secure operational audit trails, and ensure full visibility of multi-task grids and COB execution procedures.
          </p>
          <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500">
            <span>Minimum Screen Width:</span>
            <span className="font-mono font-medium text-slate-300">1024 px</span>
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-500">
            <span>Detected Resolution:</span>
            <span className="font-mono font-medium text-amber-400">
              {viewport.width} x {viewport.height} px
            </span>
          </div>
        </div>

        {/* Action Recommendations */}
        <div className="space-y-3">
          <div className="flex items-center justify-center gap-2 text-xs text-slate-400">
            <Monitor className="w-4 h-4 text-[#0F4C81]" />
            <span>Please switch to an office PC or enterprise laptop</span>
          </div>

          <div className="pt-2">
            <button
              id="btn-recheck-device"
              onClick={handleRefresh}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-[#0F4C81] hover:bg-[#155d9b] text-white text-xs font-semibold shadow-lg shadow-[#0F4C81]/25 transition-all cursor-pointer active:scale-98"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Re-check Device / Refresh</span>
            </button>
          </div>
        </div>

        {/* Footer info */}
        <p className="text-[10px] text-slate-600">
          Hando Operations Management System &bull; Enterprise Handover Portal
        </p>
      </div>
    </div>
  );
};
