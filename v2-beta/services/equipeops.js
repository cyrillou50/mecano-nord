/* ==========================================================================
   Fiches équipe : écrire par le serveur quand il est là.

   Une sanction, une promotion, un départ sont des faits d'atelier. Ils
   doivent être visibles tout de suite, par tout le monde, sans qu'un
   responsable ait à cliquer « Publier » — et sans que deux personnes qui
   modifient en même temps s'écrasent.

   Quand le serveur tient le catalogue, on lui envoie l'opération et il
   l'applique sur la fiche visée. Sinon — pas de serveur, version trop
   ancienne, catalogue encore dans le dépôt — on renvoie `null` et l'appelant
   reprend le chemin d'avant : brouillon local, puis publication. Le site
   marche dans les deux cas, c'est ce qui compte.
   ========================================================================== */

window.MNEquipe = (function () {
  "use strict";

  /* null = pas encore su, true/false ensuite. On ne sonde qu'une fois : la
     réponse ne change pas en cours de session. */
  let _dispo = null;

  const url = () => {
    try { return MNStore.api("equipe"); } catch (_) { return ""; }
  };

  /** Le serveur sait-il appliquer ces opérations ? */
  async function supporte() {
    if (_dispo !== null) return _dispo;
    const base = url();
    if (!base) return (_dispo = false);
    try {
      const sante = base.replace(/[^/]*$/, "") + "sante";
      const r = await fetchDelai(sante, 4000);
      const j = r.ok ? await r.json() : null;
      _dispo = !!(j && j.equipe && j.catalogue);
    } catch (_) {
      _dispo = false;
    }
    return _dispo;
  }

  function fetchDelai(u, ms, opts) {
    const stop = new AbortController();
    const t = setTimeout(() => stop.abort(), ms || 12000);
    return fetch(u, Object.assign({ cache: "no-store" }, opts, { signal: stop.signal }))
      .finally(() => clearTimeout(t));
  }

  /**
   * Envoie une opération.
   * @returns {Promise<null|{ok:boolean, deja?:boolean, error?:string}>}
   *          `null` = ce chemin n'est pas disponible, à l'appelant de se
   *          débrouiller comme avant.
   */
  async function envoyer(op) {
    if (!(await supporte())) return null;

    /* Un brouillon en attente interdit ce chemin : le catalogue du serveur ne
       le contient pas, et l'adopter en retour effacerait tout ce qui n'a pas
       encore été publié — des objets modifiés dans l'administration, par
       exemple. On repasse par le brouillon, qui partira avec le reste. */
    try { if (MNStore.hasDraft()) return null; } catch (_) { return null; }
    try {
      const r = await fetchDelai(url(), 12000, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(op)
      });

      /* 409 : le serveur tourne mais n'a pas encore de catalogue. Ce n'est
         pas une panne — le site publie d'abord, comme avant. */
      if (r.status === 409) { _dispo = false; return null; }
      if (r.status === 404 || r.status === 405) { _dispo = false; return null; }

      const j = await r.json().catch(() => ({}));
      if (!r.ok) return { ok: false, error: j.error || "Le serveur a répondu " + r.status };

      /* Le catalogue revient à jour : on l'adopte sans repasser par le
         réseau, et sans laisser de brouillon derrière nous. */
      if (j.catalogue) {
        try { MNStore.adopter(j.catalogue); }
        catch (e) { console.error(e); }
      }
      return { ok: true, deja: !!j.deja };
    } catch (e) {
      return { ok: false, error: e.name === "AbortError"
        ? "Le serveur ne répond pas." : "Serveur injoignable." };
    }
  }

  return { supporte, envoyer, url };
})();
