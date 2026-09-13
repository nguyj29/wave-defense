import './style.css';
import { Game } from './game.ts';
import { printDevReadout } from './economy/devReadout.ts';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const game = new Game(canvas);
game.start();

// Dev-mode readout (shop price-curve exponents + coin-yield payoff check).
// Also re-runnable any time via F9 (see game.ts debug key handling).
if (import.meta.env.DEV) {
  printDevReadout();
}

// Handy escape hatch for manual poking from the browser console.
(window as unknown as { game: Game }).game = game;
