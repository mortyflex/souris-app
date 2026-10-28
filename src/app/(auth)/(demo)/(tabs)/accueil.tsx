// The product's Accueil (`(app)/(tabs)/index`), on the demo data. Named
// `accueil` rather than `index`: the signed-out `(auth)/index` already owns `/`.
import { HomeScreen } from '@/features/home/HomeScreen';

export default function AccueilRoute() {
  return <HomeScreen />;
}
