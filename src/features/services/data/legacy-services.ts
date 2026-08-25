export type ServiceItem = {
  name: string;
  duration: number;
  break: number;
  price: number;
  color: string;
};

export const services_list: Record<string, ServiceItem[]> = {
  Brushing: [
    { name: "Brushing 1", duration: 30, break: 0, price: 20, color: "#ec4899" },
    { name: "Brushing 2", duration: 45, break: 0, price: 25, color: "#ec4899" },
    { name: "Brushing 3", duration: 60, break: 0, price: 35, color: "#ec4899" },
  ],
  "Coupe & Coiffage": [
    { name: "Coupe Femme / Homme", duration: 20, break: 0, price: 25, color: "#8b5cf6" },
    { name: "Chignon",             duration: 60, break: 0, price: 60, color: "#8b5cf6" },
  ],
};
