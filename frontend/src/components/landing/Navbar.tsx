import React from 'react';
import { ArrowRight } from 'lucide-react';
import { BackendStatus } from '../../services/api';
import { AuthUser } from '../auth/Skiper21';

interface NavbarProps {
  onLaunchStudio: () => void;
  backendStatus: BackendStatus;
  onOpenAuth?: () => void;
  authUser?: AuthUser | null;
  onSignOut?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  onLaunchStudio,
  backendStatus: _backendStatus,
  onOpenAuth,
  authUser: _authUser,
  onSignOut: _onSignOut,
}) => {
  return (
    <header className="relative z-20 w-full">
      <div className="max-w-7xl mx-auto px-6 sm:px-8 py-6 flex flex-row items-center justify-between">
        {/* Brand: PolicyPulse® */}
        <div className="flex items-baseline gap-3">
          <a
            href="#overview"
            className="text-2xl sm:text-3xl tracking-tight text-white hover:opacity-90 transition-opacity font-normal"
            style={{ fontFamily: "'Instrument Serif', serif" }}
          >
            PolicyPulse<sup className="text-xs ml-0.5 font-sans font-normal opacity-70">®</sup>
          </a>
        </div>

        {/* Central Navigation Links (Desktop) */}
        <nav className="hidden md:flex items-center gap-8 text-sm text-[#a1a1aa] font-sans">
          <a href="#overview" className="hover:text-white transition-colors duration-200">
            Overview
          </a>
          <a href="#how-it-works" className="hover:text-white transition-colors duration-200">
            Policy Engine
          </a>
          <a href="#capabilities" className="hover:text-white transition-colors duration-200">
            Guardrails
          </a>
          <a href="#demo" className="hover:text-white transition-colors duration-200">
            Live Preview
          </a>
          <a href="#architecture" className="hover:text-white transition-colors duration-200">
            Taxonomy
          </a>
        </nav>

        {/* Right-side Controls: Sign In & Launch CTA */}
        <div className="flex items-center gap-2.5 sm:gap-4">
          {/* Skiper21 Authentication: Sign In with exact liquid-glass design as Launch Agent Studio */}
          <button
            onClick={onOpenAuth}
            className="group liquid-glass inline-flex items-center gap-2 px-5 py-2 sm:px-6 sm:py-2.5 rounded-full text-xs sm:text-sm font-medium text-white hover:text-white hover:scale-[1.03] active:scale-95 transition-all duration-200 cursor-pointer shadow-lg"
          >
            <span>Sign In</span>
          </button>

          <button
            onClick={onLaunchStudio}
            className="group liquid-glass inline-flex items-center gap-2 px-5 py-2 sm:px-6 sm:py-2.5 rounded-full text-xs sm:text-sm font-medium text-white hover:text-white hover:scale-[1.03] active:scale-95 transition-all duration-200 cursor-pointer shadow-lg"
          >
            <span>Launch Agent Studio</span>
            <ArrowRight className="w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-x-1" />
          </button>
        </div>
      </div>
    </header>
  );
};
