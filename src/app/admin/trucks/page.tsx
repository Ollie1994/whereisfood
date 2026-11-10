import AdminTrucks from "@/components/Admin/AdminTrucks";

// Add, edit and set inactive the trucks (Phase 7 plan, step 10), through the admin truck
// routes. Behind the proxy, which lets only an admin through.
export default function TrucksPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold">Foodtrucks</h1>
      <AdminTrucks />
    </>
  );
}
