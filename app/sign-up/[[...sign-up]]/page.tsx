import { SignUp } from "@clerk/nextjs";
import { clerkAppearance } from "@/lib/clerk-appearance";

export default function SignUpPage() {
  return (
    <div className="auth-page">
      <div className="auth-card-wrap">
        <SignUp appearance={clerkAppearance} />
      </div>
    </div>
  );
}
