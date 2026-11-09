import { HardDriveIcon, LogOutIcon, UserRoundIcon } from "lucide-react"
import { useEffect, useId, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { authClient, fetchAsUser } from "@/auth/client"

import type { AuthClient } from "@/auth/client"

type Mode = "sign-in" | "sign-up"

const FALLBACK_ERROR = "Something went wrong. Try again."

interface Profile {
  readonly name: string
  readonly email: string
}

interface MeResponse {
  readonly user: Profile
}

interface SignInDialogProps {
  readonly client: AuthClient
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
}

function SignInDialog({ client, open, onOpenChange }: SignInDialogProps) {
  const [mode, setMode] = useState<Mode>("sign-in")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | undefined>()
  const id = useId()

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    // onSubmit, not `<form action>`: React resets an action form after each submission,
    // which would clear the email after a failed sign-in.
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setPending(true)
    setError(undefined)
    const email = String(form.get("email"))
    const password = String(form.get("password"))
    // The client returns `{ error }` for some failures and throws for others (a 401 on a
    // wrong password throws), so both paths end in the same message.
    try {
      const result =
        mode === "sign-up"
          ? await client.signUp.email({ email, password, name: String(form.get("name")) })
          : await client.signIn.email({ email, password })
      if (result.error) return setError(result.error.message ?? FALLBACK_ERROR)
      onOpenChange(false)
    } catch (cause) {
      setError(cause instanceof Error && cause.message ? cause.message : FALLBACK_ERROR)
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{mode === "sign-in" ? "Sign in" : "Create an account"}</DialogTitle>
          <DialogDescription>Accounts will let you save machines across devices.</DialogDescription>
        </DialogHeader>
        <Tabs value={mode} onValueChange={(value) => setMode(value === "sign-up" ? "sign-up" : "sign-in")}>
          <TabsList className="w-full">
            <TabsTrigger value="sign-in">Sign in</TabsTrigger>
            <TabsTrigger value="sign-up">Create account</TabsTrigger>
          </TabsList>
        </Tabs>
        <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-3">
          {mode === "sign-up" && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${id}-name`}>Name</Label>
              <Input id={`${id}-name`} name="name" autoComplete="name" required />
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-email`}>Email</Label>
            <Input id={`${id}-email`} name="email" type="email" autoComplete="email" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-password`}>Password</Label>
            <Input
              id={`${id}-password`}
              name="password"
              type="password"
              minLength={8}
              autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
              required
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" disabled={pending}>
            {pending ? "Working…" : mode === "sign-in" ? "Sign in" : "Create account"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function LocalWorkspace({ children }: { readonly children?: React.ReactNode }) {
  return (
    <>
      <div className="flex min-w-0 flex-col leading-tight">
        <span className="text-sm font-medium">Local workspace</span>
        <span className="text-xs text-muted-foreground">Saved in this browser</span>
      </div>
      {children}
    </>
  )
}

const footer = "flex h-14 items-center gap-2.5 border-t px-3"
const avatar = "flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-muted-foreground"

/** Sidebar footer: who you are, as our server reads you from Postgres, or a way to sign in. */
export function Account() {
  if (authClient === undefined) {
    return (
      <section aria-label="Account" className={footer}>
        <span className={avatar}>
          <HardDriveIcon className="size-4" />
        </span>
        <LocalWorkspace />
      </section>
    )
  }
  return <SignedInAccount client={authClient} />
}

function SignedInAccount({ client }: { readonly client: AuthClient }) {
  const { data: session, isPending } = client.useSession()
  const [profile, setProfile] = useState<Profile | undefined>()
  const [open, setOpen] = useState(false)
  const userId = session?.user.id

  useEffect(() => {
    setProfile(undefined)
    if (userId === undefined) return
    let cancelled = false
    void fetchAsUser("/api/me").then(async (response) => {
      if (cancelled) return
      if (!response.ok)
        return void toast.error("Could not load your account", { description: `HTTP ${response.status}` })
      const body: MeResponse = await response.json()
      setProfile(body.user)
    })
    return () => {
      cancelled = true
    }
  }, [userId])

  const signOut = async () => {
    await client.signOut()
    toast("Signed out")
  }

  return (
    <section aria-label="Account" className={footer}>
      <span className={avatar}>
        {session ? <UserRoundIcon className="size-4" /> : <HardDriveIcon className="size-4" />}
      </span>
      {session ? (
        <>
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="truncate text-sm font-medium">{profile?.name ?? session.user.name}</span>
            <span className="truncate text-xs text-muted-foreground">{profile?.email ?? "Checking account…"}</span>
          </div>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Sign out"
            className="ml-auto size-8 text-muted-foreground"
            onClick={() => void signOut()}
          >
            <LogOutIcon className="size-4" />
          </Button>
        </>
      ) : (
        <LocalWorkspace>
          <Button
            size="sm"
            variant="outline"
            className="ml-auto h-8"
            disabled={isPending}
            onClick={() => setOpen(true)}
          >
            Sign in
          </Button>
          <SignInDialog client={client} open={open} onOpenChange={setOpen} />
        </LocalWorkspace>
      )}
    </section>
  )
}
