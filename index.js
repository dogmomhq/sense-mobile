import { registerRootComponent } from 'expo';
import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import App from './App';

// Top-level boundary: if App throws during render, SHOW the error on screen instead of a
// silent white screen (release builds swallow JS errors). Diagnostic + permanent safety net.
class RootBoundary extends React.Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(e) { return { err: e }; }
  componentDidCatch(e, info) { try { console.error('ROOTBOUNDARY', e && e.message, info && info.componentStack); } catch (_) {} }
  render() {
    if (this.state.err) {
      const e = this.state.err;
      return (
        <ScrollView style={{ flex: 1, backgroundColor: '#fff' }} contentContainerStyle={{ padding: 28, paddingTop: 80 }}>
          <Text style={{ fontSize: 20, fontWeight: '800', color: '#B00020' }}>BOOT ERROR</Text>
          <Text style={{ fontSize: 15, color: '#111', marginTop: 14 }}>{String((e && e.message) || e)}</Text>
          <Text style={{ fontSize: 11, color: '#555', marginTop: 16 }}>{String((e && e.stack) || '').slice(0, 2000)}</Text>
        </ScrollView>
      );
    }
    return <App />;
  }
}
function Root() { return <RootBoundary />; }
registerRootComponent(Root);
