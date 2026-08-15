import './bootstrapUserData';
import { nativeTheme } from 'electron';
import sourceMapSupport from 'source-map-support';
import { appState } from './AppState';

if (process.env.NODE_ENV === 'production') {
  sourceMapSupport.install();
}

// A real dark theme is future work; keep Drumroll on its designed light field.
nativeTheme.themeSource = 'light';

if (nativeTheme.themeSource !== 'light') {
  throw new Error('Drumroll requires the light appearance');
}

appState.start();
