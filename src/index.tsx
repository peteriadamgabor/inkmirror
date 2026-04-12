/* @refresh reload */
import { render } from 'solid-js/web';
import './index.css';

const App = () => <div class="p-8">StoryForge — scaffolding OK</div>;

const root = document.getElementById('root');
if (!root) throw new Error('#root not found');
render(() => <App />, root);
