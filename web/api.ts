export type Data = Record<string, any>;
export const workspace = () => localStorage.getItem("closeos.workspace") || "";
// Language of public error messages (set by the booking page from its event).
let language = "";
export const setApiLanguage = (l: string) => {
  language = l;
};
export async function api(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<any> {
  const r = await fetch("/api/v1" + path, {
    method,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "X-Workspace-Id": workspace(),
      ...(language ? { "X-CloseOS-Lang": language } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  let data;
  try {
    data = await r.json();
  } catch {
    throw new Error("Le serveur ne répond pas. Réessayez.");
  }
  if (!r.ok) {
    const err = new Error(data.error || "Une erreur est survenue.") as Error & {
      status: number;
    };
    err.status = r.status;
    throw err;
  }
  return data;
}
export function go(path: string) {
  history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}
export function copy(text: string) {
  return navigator.clipboard.writeText(text);
}
export const date = (value: string) =>
  new Date(value).toLocaleString("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  });
export const labels: Data = {
  potential: "Potentiel",
  qualified: "Qualifié",
  disqualified: "Disqualifié",
  booked: "Rendez-vous pris",
  won: "Gagné",
  lost: "Perdu",
  confirmed: "Confirmé",
  cancelled: "Annulé",
  pending: "En attente",
  processing: "En cours",
  sent: "Accepté par le fournisseur",
  retry: "Nouvel essai prévu",
  blocked: "Configuration requise",
  failed: "Échec",
  skipped: "Ignoré",
  uncertain: "À vérifier",
  sale: "Vente",
  no_sale: "Pas de vente",
  no_show: "Absent",
  follow_up: "À relancer",
  unqualified: "Non qualifié",
  owner: "Propriétaire",
  admin: "Administrateur",
  member: "Membre",
  viewer: "Observateur",
  strategy: "Stratégie",
  discovery: "Découverte",
  collective: "Collectif",
};
export const triggers: Data = {
  "lead.captured": "Coordonnées capturées",
  "lead.qualified": "Prospect qualifié",
  "lead.disqualified": "Prospect disqualifié",
  "booking.created": "Rendez-vous réservé",
  "booking.before": "Avant le rendez-vous",
  "booking.started": "Après le début",
  "booking.ended": "Après la fin",
  "booking.cancelled": "Rendez-vous annulé",
  "booking.rescheduled": "Rendez-vous reporté",
};
