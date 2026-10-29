import { ChangePasswordCard } from './change-password-card';
import { SessionsCard } from './sessions-card';

export function AuthenticationSection() {
  return (
    <div className="space-y-6">
      <SessionsCard />
      <ChangePasswordCard />
    </div>
  );
}
