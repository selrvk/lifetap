// Must be first: installs crypto.getRandomValues (native CSPRNG), which the
// tag encryption (@noble) needs for keys and nonces.
import 'react-native-get-random-values';
import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => App);