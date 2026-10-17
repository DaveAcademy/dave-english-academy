// DashboardErrorBoundary.jsx
// Wraps one dashboard section so a render-time error in that section
// (bad data shape, a widget throwing) shows a small inline fallback
// instead of taking down the rest of the dashboard. Must be a class
// component - React has no hook equivalent of getDerivedStateFromError.

import { Component } from 'react';
import { useTranslation } from 'react-i18next';

function Fallback() {
  const { t } = useTranslation('dashboard');
  return <p className="rounded-xl border border-ink/[0.06] bg-white p-4 text-sm text-ink/40 shadow-card sm:p-5">{t('sectionUnavailable')}</p>;
}

export default class DashboardErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    console.error('Dashboard section failed to render:', error);
  }

  render() {
    return this.state.hasError ? <Fallback /> : this.props.children;
  }
}
