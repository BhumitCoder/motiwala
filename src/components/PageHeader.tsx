import { type ReactNode } from "react";

/**
 * Standard page header — same bar every list/detail page in the app uses,
 * so switching pages never feels like switching apps. `icon` renders the
 * colored badge already established on detail pages (Sale=success,
 * Purchase=warning, most master-data modules=primary); omit it only for
 * pages that don't fit the icon-badge treatment (e.g. Settings tabs).
 */
export function PageHeader({
  title,
  subtitle,
  actions,
  icon,
  iconClassName = "bg-primary-soft text-primary",
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  icon?: ReactNode;
  iconClassName?: string;
}) {
  return (
    <div className="no-print bg-white border-b px-3 py-2.5 sm:px-5 sm:py-3 flex items-center justify-between gap-2 sm:gap-3 flex-wrap">
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        {icon && (
          <div
            className={`h-8 w-8 sm:h-10 sm:w-10 shrink-0 rounded-lg flex items-center justify-center ${iconClassName}`}
          >
            {icon}
          </div>
        )}
        <div className="min-w-0">
          <h1 className="text-[15px] sm:text-[17px] font-bold tracking-tight leading-tight text-gray-800 truncate">
            {title}
          </h1>
          {subtitle && (
            <p className="text-[11px] sm:text-[12px] text-gray-400 mt-0.5 truncate">{subtitle}</p>
          )}
        </div>
      </div>
      {actions && (
        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">{actions}</div>
      )}
    </div>
  );
}
