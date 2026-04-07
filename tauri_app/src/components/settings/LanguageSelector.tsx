import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDownIcon } from "../ui/Icons";

const LanguageSelector = () => {
    const { i18n, t } = useTranslation();
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const languages = [
        { code: "en", label: "English", sub: "EN", flag: "🇺🇸" },
        { code: "ru", label: "Русский", sub: "RU", flag: "🇷🇺" },
    ];

    const currentLang = languages.find((l) => l.code === (i18n.resolvedLanguage || "en")) || languages[0];

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`group flex items-center space-x-3 px-4 py-2.5 rounded-xl border transition-all duration-300 ${isOpen
                    ? "bg-white/10 border-indigo-500/50 shadow-[0_0_20px_rgba(99,102,241,0.2)]"
                    : "bg-white/[0.03] border-white/5 hover:bg-white/5 hover:border-white/10"
                    }`}
            >
                <span className="text-lg leading-none">{currentLang.flag}</span>
                <div className="flex flex-col items-start leading-tight">
                    <span className="text-sm font-bold text-secondary group-hover:text-white transition-colors">
                        {currentLang.label}
                    </span>
                    <span className="text-[10px] font-black tracking-widest text-tertiary opacity-50 uppercase">
                        {currentLang.sub}
                    </span>
                </div>
                <ChevronDownIcon className={`text-tertiary transition-transform duration-300 ${isOpen ? "rotate-180 text-indigo-400" : ""}`} />
            </button>

            {isOpen && (
                <div className="absolute right-0 mt-3 w-48 bg-black/20 backdrop-blur-md border border-white/10 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] py-2 z-[1000] animate-none overflow-hidden origin-top-right transition-all">
                    <div className="px-3 py-2 border-b border-white/5 mb-1">
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-tertiary opacity-40">{t("settings.language", "Language")}</span>
                    </div>
                    {languages.map((lang) => (
                        <button
                            key={lang.code}
                            onClick={() => {
                                i18n.changeLanguage(lang.code);
                                setIsOpen(false);
                            }}
                            className={`w-full px-4 py-3 flex items-center justify-between transition-all group ${lang.code === currentLang.code
                                ? "bg-indigo-500/10 text-indigo-400"
                                : "text-secondary hover:bg-white/5 hover:text-white"
                                }`}
                        >
                            <div className="flex items-center space-x-3">
                                <span className="text-base">{lang.flag}</span>
                                <div className="flex flex-col items-start leading-tight">
                                    <span className="text-sm font-bold">{lang.label}</span>
                                    <span className="text-[9px] font-black tracking-widest opacity-40 uppercase">{lang.sub}</span>
                                </div>
                            </div>
                            {lang.code === currentLang.code && (
                                <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(79,70,229,0.8)]" />
                            )}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

export default LanguageSelector;
