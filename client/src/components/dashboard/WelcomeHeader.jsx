export default function WelcomeHeader({ name = "Admin" }) {
  const hour = new Date().getHours();
  let greeting = "Hello";
  if (hour < 12) greeting = "Good Morning";
  else if (hour < 18) greeting = "Good Afternoon";
  else greeting = "Good Evening";

  return (
    <div className="flex flex-col space-y-2 mb-6">
      <h1 className="text-3xl font-bold tracking-tight text-gray-900">
        {greeting}, {name}
      </h1>
      <p className="text-muted-foreground">
        Here's what's happening with your business today.
      </p>
    </div>
  );
}
