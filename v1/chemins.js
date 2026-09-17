/* ==========================================================================
   L'ancienne version, rangée dans son dossier.

   Elle est gardée telle quelle, en état de marche, au cas où il faudrait y
   revenir. Les données restent celles du site — un seul catalogue, un seul
   tableau de service : ce sont les mêmes employés, pas une copie figée.

   Ce fichier ne fait que dire où les trouver, maintenant que la V1 ne vit plus
   à la racine. Il se charge AVANT config.js, qui complète sans écraser.
   ========================================================================== */

window.MN_CONFIG = window.MN_CONFIG || {};
MN_CONFIG.catalogUrl = "../data/catalog.json";
MN_CONFIG.dutyFile = "../data/duty.json";
MN_CONFIG.imgDir = "../assets/img";
