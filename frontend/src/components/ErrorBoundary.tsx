import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

type ErrorBoundaryProps = React.PropsWithChildren;

type ErrorBoundaryState = {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
};

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(_error: Error) {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ error, errorInfo });
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          backgroundColor: 'var(--bg-dark, #0a0f1a)',
          color: 'var(--text-light, #f0f6fc)',
          fontFamily: 'var(--font-primary, "Outfit", sans-serif)',
          padding: '20px',
          textAlign: 'center'
        }}>
          <div style={{
            background: 'var(--glass-card-bg, rgba(22, 27, 34, 0.6))',
            border: '1px solid var(--glass-card-border, rgba(240, 246, 252, 0.1))',
            borderRadius: '16px',
            padding: '40px',
            maxWidth: '500px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)'
          }}>
            <AlertTriangle size={48} color="var(--primary-accent, #3b82f6)" style={{ marginBottom: '20px' }} />
            <h1 style={{ fontSize: '24px', marginBottom: '16px' }}>Ops! Algo deu errado.</h1>
            <p style={{ color: 'var(--color-hint, #8b949e)', marginBottom: '24px', lineHeight: '1.5' }}>
              Ocorreu um erro inesperado na interface. Não se preocupe, seus dados estão seguros.
            </p>
            {import.meta.env.DEV && this.state.error && (
              <pre style={{
                textAlign: 'left',
                background: 'rgba(0,0,0,0.5)',
                padding: '12px',
                borderRadius: '8px',
                fontSize: '12px',
                overflowX: 'auto',
                marginBottom: '24px',
                color: '#ff7b72'
              }}>
                {this.state.error.toString()}
              </pre>
            )}
            <button
              onClick={() => window.location.href = '/'}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                background: 'var(--primary-accent, #3b82f6)',
                color: '#fff',
                border: 'none',
                padding: '12px 24px',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer',
                width: '100%'
              }}
            >
              <RefreshCw size={16} /> VOLTAR AO INÍCIO
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
