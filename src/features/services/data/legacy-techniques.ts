export type PackageItem = {
  name: string;
  duration: number;
  break: number;
  price: number | "Multiprix";
  color: string;
};

export const packages_list: Record<string, PackageItem[]> = {
  Balayage: [
    {
      name: "Balayage 1",
      duration: 90,
      break: 60,
      price: 45,
      color: "#3b82f6",
    },
    {
      name: "Balayage 2",
      duration: 105,
      break: 60,
      price: 50,
      color: "#3b82f6",
    },
    {
      name: "Balayage 3",
      duration: 120,
      break: 60,
      price: 60,
      color: "#3b82f6",
    },
  ],
  Coloration: [
    {
      name: "Couleur Racines",
      duration: 45,
      break: 20,
      price: 30,
      color: "#10b981",
    },
    {
      name: "Gloss",
      duration: 10,
      break: 10,
      price: "Multiprix",
      color: "#10b981",
    },
    {
      name: "Dose Supplémentaire",
      duration: 0,
      break: 20,
      price: 15,
      color: "#10b981",
    },
  ],
  Coupe: [
    {
      name: "Coupe Brushing 1",
      duration: 50,
      break: 0,
      price: 40,
      color: "#f59e0b",
    },
    {
      name: "Coupe Brushing 2",
      duration: 65,
      break: 0,
      price: 45,
      color: "#f59e0b",
    },
    {
      name: "Coupe Brushing 3",
      duration: 120,
      break: 0,
      price: 55,
      color: "#f59e0b",
    },
  ],
  Soin: [
    {
      name: "Soin Classique",
      duration: 5,
      break: 10,
      price: 10,
      color: "#6366f1",
    },
    {
      name: "Soin Profond",
      duration: 5,
      break: 10,
      price: 15,
      color: "#6366f1",
    },
    {
      name: "Traitement SOS",
      duration: 5,
      break: 10,
      price: 80,
      color: "#6366f1",
    },
  ],
};
