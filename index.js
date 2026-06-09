import { registerRootComponent } from 'expo';
import React from 'react';
import { Text, ScrollView } from 'react-native';

// Catch module-load failure (App or its imports throwing at evaluation time)
let App = null, loadErr = null;
try { App = require('./App').default; } catch (e) { loadErr = e; }

// reskin-ui: web preview hook — ?reskin=home | ?reskin=question&t=6 renders the
// new pixel-locked screens standalone (used by CI snapshots; harmless otherwise)
let Preview = null;
try {
  if (typeof window !== 'undefined' && window.location && /[?&]reskin=/.test(window.location.search)) {
    Preview = require('./screens/PreviewApp').default;
  }
} catch (e) { loadErr = loadErr || e; }

function ErrText({ title, e }) {
  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#fff' }} contentContainerStyle={{ padding: 28, paddingTop: 80 }}>
      <Text style={{ fontSize: 20, fontWeight: '800', color: '#B00020' }}>{title}</Text>
      <Text style={{ fontSize: 15, color: '#111', marginTop: 14 }}>{String((e && e.message) || e)}</Text>
      <Text style={{ fontSize: 11, color: '#555', marginTop: 16 }}>{String((e && e.stack) || '').slice(0, 2000)}</Text>
    </ScrollView>
  );
}

class RootBoundary extends React.Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(e) { return { err: e }; }
  render() { if (this.state.err) return <ErrText title="RENDER ERROR" e={this.state.err} />; return this.props.children; }
}

function Root() {
  if (loadErr) return <ErrText title="LOAD ERROR" e={loadErr} />;
  if (Preview) return (<RootBoundary><Preview /></RootBoundary>);
  return (<RootBoundary><App /></RootBoundary>);
}
registerRootComponent(Root);
