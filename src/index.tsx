/* @refresh reload */
import { render } from 'solid-js/web';
import { Router, Route } from '@solidjs/router';
import { EditorRoute } from '@/routes/editor';
import { PerfHarnessRoute } from '@/routes/perf-harness';
import './index.css';

const root = document.getElementById('root');
if (!root) throw new Error('#root not found');

render(
  () => (
    <Router>
      <Route path="/" component={EditorRoute} />
      <Route path="/perf" component={PerfHarnessRoute} />
    </Router>
  ),
  root,
);
