// ErrorBanner.jsx
// One-line inline error banner, extracted from the identical JSX that was
// duplicated in MyHomework.jsx and MyCertificates.jsx. Renders nothing
// when there's no message, so callers can pass a possibly-empty error
// state directly without their own conditional wrapper.

export default function ErrorBanner({ children }) {
  if (!children) return null;
  return <div className="mb-4 rounded-lg border border-inactive/30 bg-inactive/5 px-4 py-3 text-sm text-inactive">{children}</div>;
}
