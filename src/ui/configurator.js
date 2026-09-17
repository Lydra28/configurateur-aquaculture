import './configurator.css'
import { PRESETS, projectCriteria } from '../state/scenario.js'

/**
 * UI de l'ÉCRAN F — le panneau de configuration et le panneau impact,
 * fidèles à la maquette Figma « à valider — dev-ready », câblés sur
 * NEMO.scenario. Vanilla JS : le DOM est construit une fois, seuls le
 * score, les jauges et les états sélectionnés changent ensuite.
 *
 * Textes : wording-parcours.md fait foi pour les libellés (titres de
 * question), composantes.md pour les textes d'aide (effets visuels),
 * la maquette pour les pills de rubrique. Décisions Romain : pas de
 * champ recherche en V1 ; sens du score = PRÉSERVATION (libellé du
 * panneau adapté : niveaux Préservé / Fragile / Dégradé, seuils
 * 70+ / 40-69 / <40).
 *
 * Écrans G et H-1 (maquettes « screen G » / « screen H-1 ») :
 * « Consulter le score final » replie le configurateur (F→G) — barre
 * haute avec icône de retour, pill impact centré, « Conclure
 * l'expérience » ; celui-ci pose le voile d'appel à l'action (H-1),
 * boutons factices en attendant les vraies URLs, Échap pour revenir.
 */

/* Icônes exportées de la maquette (assets Figma, inlinés au build) */
const ICONS = {
  radio: `<svg viewBox="0 0 19 19" fill="none"><path d="M14.5 0.5H4.5C2.29086 0.5 0.5 2.29086 0.5 4.5V14.5C0.5 16.7091 2.29086 18.5 4.5 18.5H14.5C16.7091 18.5 18.5 16.7091 18.5 14.5V4.5C18.5 2.29086 16.7091 0.5 14.5 0.5Z" stroke="white"/><path class="dot" d="M11.5 5.5H7.5C6.39543 5.5 5.5 6.39543 5.5 7.5V11.5C5.5 12.6046 6.39543 13.5 7.5 13.5H11.5C12.6046 13.5 13.5 12.6046 13.5 11.5V7.5C13.5 6.39543 12.6046 5.5 11.5 5.5Z" fill="white"/></svg>`,
  /* Icônes de sections — exports de la section Figma « icon », nommées
     selon les sections (fill currentColor : héritent du gris du pill) */
  profils: `<svg width="15" height="15" viewBox="0 0 32 32" fill="none"><path d="M16 3C13.4288 3 10.9154 3.76244 8.77759 5.1909C6.63975 6.61935 4.97351 8.64968 3.98957 11.0251C3.00563 13.4006 2.74819 16.0144 3.2498 18.5362C3.75141 21.0579 4.98953 23.3743 6.80762 25.1924C8.6257 27.0105 10.9421 28.2486 13.4638 28.7502C15.9856 29.2518 18.5995 28.9944 20.9749 28.0104C23.3503 27.0265 25.3807 25.3603 26.8091 23.2224C28.2376 21.0846 29 18.5712 29 16C28.9964 12.5533 27.6256 9.24882 25.1884 6.81163C22.7512 4.37445 19.4467 3.00364 16 3ZM27 16C27.0011 17.4112 26.7295 18.8094 26.2 20.1175L20.6125 16.6812C20.3749 16.5347 20.1092 16.4397 19.8325 16.4025L16.98 16.0175C16.5869 15.9662 16.1875 16.0321 15.8317 16.2069C15.476 16.3817 15.1797 16.6576 14.98 17H13.89L13.415 16.0175C13.2837 15.7439 13.0915 15.504 12.8532 15.3162C12.6148 15.1283 12.3367 14.9975 12.04 14.9338L11.04 14.7175L12.0175 13H14.1063C14.4442 12.9993 14.7766 12.9133 15.0725 12.75L16.6038 11.905C16.7383 11.83 16.8641 11.7403 16.9788 11.6375L20.3425 8.595C20.6798 8.29277 20.9039 7.8846 20.978 7.43784C21.0521 6.99108 20.9717 6.53241 20.75 6.1375L20.705 6.05625C22.5873 6.94875 24.1778 8.35674 25.292 10.1168C26.4063 11.8769 26.9985 13.9169 27 16ZM17.9138 5.1675L19 7.1125L15.6363 10.155L14.1063 11H12.0175C11.6659 10.9995 11.3204 11.0916 11.0158 11.2672C10.7112 11.4428 10.4583 11.6955 10.2825 12L9.19126 13.9038L7.92251 10.5238L9.29001 7.29C10.5004 6.35474 11.8929 5.68262 13.3781 5.31669C14.8633 4.95076 16.4086 4.8991 17.915 5.165L17.9138 5.1675ZM5.00001 16C4.99834 14.365 5.36311 12.7505 6.06751 11.275L7.48501 15.0588C7.60313 15.372 7.79802 15.6506 8.0518 15.869C8.30558 16.0874 8.61012 16.2386 8.93751 16.3088L11.6163 16.885L12.0925 17.875C12.2578 18.2117 12.5139 18.4955 12.832 18.6943C13.1501 18.8931 13.5174 18.999 13.8925 19H14.0775L13.1738 21.0287C13.0145 21.386 12.9635 21.782 13.0271 22.168C13.0906 22.5539 13.2659 22.9127 13.5313 23.2L13.5488 23.2175L16 25.7425L15.7575 26.9925C12.8848 26.9256 10.152 25.7387 8.14216 23.685C6.13236 21.6313 5.00477 18.8735 5.00001 16ZM17.8225 26.8475L17.9638 26.1213C18.0218 25.8127 18.0068 25.4949 17.92 25.1931C17.8332 24.8914 17.6769 24.6142 17.4638 24.3838C17.4576 24.3782 17.4518 24.3724 17.4463 24.3662L15 21.8425L16.7125 18L19.565 18.385L25.28 21.9C24.452 23.2003 23.3605 24.3125 22.076 25.1647C20.7914 26.0169 19.3424 26.5902 17.8225 26.8475Z" fill="currentColor"/></svg>`,
  echelle: `<svg width="15" height="15" viewBox="0 0 32 32" fill="none"><path d="M29.415 9.17144L22.8287 2.58644C22.643 2.40067 22.4225 2.25331 22.1798 2.15277C21.9371 2.05223 21.677 2.00049 21.4143 2.00049C21.1517 2.00049 20.8916 2.05223 20.6489 2.15277C20.4062 2.25331 20.1857 2.40067 20 2.58644L2.58497 20.0002C2.39921 20.1859 2.25185 20.4064 2.15131 20.6491C2.05077 20.8918 1.99902 21.1519 1.99902 21.4146C1.99902 21.6772 2.05077 21.9374 2.15131 22.18C2.25185 22.4227 2.39921 22.6432 2.58497 22.8289L9.17122 29.4139C9.35695 29.5997 9.57744 29.7471 9.82012 29.8476C10.0628 29.9481 10.3229 29.9999 10.5856 29.9999C10.8483 29.9999 11.1084 29.9481 11.3511 29.8476C11.5937 29.7471 11.8142 29.5997 12 29.4139L29.415 12.0002C29.6007 11.8145 29.7481 11.594 29.8486 11.3513C29.9492 11.1086 30.0009 10.8485 30.0009 10.5858C30.0009 10.3231 29.9492 10.063 29.8486 9.82034C29.7481 9.57766 29.6007 9.35716 29.415 9.17144ZM10.585 28.0002L3.99997 21.4139L7.99997 17.4139L11.2925 20.7077C11.3854 20.8006 11.4957 20.8743 11.6171 20.9246C11.7385 20.9749 11.8686 21.0007 12 21.0007C12.1314 21.0007 12.2615 20.9749 12.3829 20.9246C12.5043 20.8743 12.6146 20.8006 12.7075 20.7077C12.8004 20.6148 12.8741 20.5045 12.9244 20.3831C12.9746 20.2617 13.0005 20.1316 13.0005 20.0002C13.0005 19.8688 12.9746 19.7387 12.9244 19.6173C12.8741 19.4959 12.8004 19.3856 12.7075 19.2927L9.41372 16.0002L12 13.4139L15.2925 16.7077C15.4801 16.8953 15.7346 17.0007 16 17.0007C16.2653 17.0007 16.5198 16.8953 16.7075 16.7077C16.8951 16.52 17.0005 16.2655 17.0005 16.0002C17.0005 15.7348 16.8951 15.4803 16.7075 15.2927L13.4137 12.0002L16 9.41394L19.2925 12.7077C19.3854 12.8006 19.4957 12.8743 19.6171 12.9246C19.7385 12.9749 19.8686 13.0007 20 13.0007C20.1314 13.0007 20.2615 12.9749 20.3829 12.9246C20.5043 12.8743 20.6146 12.8006 20.7075 12.7077C20.8004 12.6148 20.8741 12.5045 20.9244 12.3831C20.9746 12.2617 21.0005 12.1316 21.0005 12.0002C21.0005 11.8688 20.9746 11.7387 20.9244 11.6173C20.8741 11.4959 20.8004 11.3856 20.7075 11.2927L17.4137 8.00019L21.4137 4.00019L28 10.5864L10.585 28.0002Z" fill="currentColor"/></svg>`,
  elevage: `<svg width="15" height="15" viewBox="0 0 32 32" fill="none"><path d="M21.0002 9.50004C21.0002 9.79671 20.9122 10.0867 20.7474 10.3334C20.5826 10.5801 20.3483 10.7723 20.0742 10.8859C19.8001 10.9994 19.4985 11.0291 19.2076 10.9712C18.9166 10.9133 18.6493 10.7705 18.4395 10.5607C18.2298 10.3509 18.0869 10.0836 18.029 9.79267C17.9711 9.5017 18.0008 9.2001 18.1144 8.92601C18.2279 8.65192 18.4202 8.41765 18.6668 8.25283C18.9135 8.08801 19.2035 8.00004 19.5002 8.00004C19.898 8.00004 20.2796 8.15807 20.5609 8.43938C20.8422 8.72068 21.0002 9.10221 21.0002 9.50004ZM27.0902 17.955C24.6689 22.3175 20.1602 24.675 13.6852 24.9675L10.9352 31.3938C10.8579 31.5742 10.7292 31.7279 10.5652 31.8357C10.4011 31.9435 10.209 32.0007 10.0127 32H9.94895C9.74288 31.9871 9.54586 31.9107 9.38494 31.7814C9.22402 31.652 9.10709 31.476 9.0502 31.2775L7.2002 24.7988L0.725196 22.945C0.52616 22.8891 0.349342 22.7729 0.21908 22.6124C0.0888172 22.4518 0.0115128 22.2549 -0.00219373 22.0486C-0.0159003 21.8423 0.0346648 21.6368 0.142542 21.4605C0.25042 21.2841 0.410306 21.1455 0.600196 21.0638L7.02645 18.3138C7.3202 11.8413 9.6777 7.33379 14.0377 4.91129C17.1314 3.19379 20.6302 2.93129 23.0227 3.01379C25.3527 3.09379 27.5227 3.54754 27.8802 3.76379C28.0262 3.84983 28.1479 3.97155 28.2339 4.11754C28.4452 4.47379 28.9002 6.64379 28.9839 8.97379C29.0689 11.3613 28.8077 14.8613 27.0902 17.955ZM20.1927 21.58C19.0372 21.1395 18.0311 20.3792 17.2917 19.388C16.5524 18.3968 16.1105 17.2156 16.0177 15.9825C14.7849 15.8899 13.6039 15.4482 12.6129 14.7091C11.6219 13.97 10.8618 12.964 10.4214 11.8088C9.55061 13.7913 9.07978 16.1909 9.00895 19.0075C9.00452 19.1993 8.94501 19.3858 8.83751 19.5447C8.73002 19.7037 8.57908 19.8283 8.4027 19.9038L3.97895 21.7963L8.2852 23.0288C8.44858 23.0756 8.59733 23.1633 8.71741 23.2836C8.83748 23.4039 8.92491 23.5528 8.97145 23.7163L10.2014 28.0213L12.0964 23.5963C12.1721 23.4201 12.2968 23.2695 12.4557 23.1622C12.6146 23.0549 12.801 22.9956 12.9927 22.9913C15.8069 22.9238 18.2069 22.4534 20.1927 21.58ZM26.5527 5.44629C24.7839 5.07129 18.5402 4.07129 14.0152 7.29004C13.2662 7.82442 12.5934 8.45814 12.0152 9.17379C11.9678 9.82679 12.0635 10.4823 12.2956 11.0945C12.5276 11.7067 12.8905 12.2609 13.3589 12.7184C13.8272 13.1759 14.3897 13.5257 15.0072 13.7434C15.6247 13.9611 16.2822 14.0414 16.9339 13.9788C17.0808 13.9646 17.2289 13.9832 17.3677 14.033C17.5065 14.0828 17.6326 14.1628 17.7369 14.2671C17.8412 14.3714 17.9211 14.4974 17.971 14.6363C18.0208 14.7751 18.0393 14.9232 18.0252 15.07C17.9627 15.722 18.0432 16.3797 18.2612 16.9974C18.4792 17.615 18.8294 18.1775 19.2873 18.6458C19.7452 19.1141 20.2998 19.4767 20.9124 19.7085C21.525 19.9402 22.1808 20.0355 22.8339 19.9875C23.5469 19.4092 24.1777 18.7363 24.7089 17.9875C27.9277 13.4663 26.9277 7.21754 26.5527 5.44629Z" fill="currentColor"/></svg>`,
  alimentation: `<svg width="15" height="15" viewBox="0 0 32 32" fill="none"><path d="M30.9536 5.98633C30.9393 5.74168 30.8357 5.5108 30.6624 5.33752C30.4891 5.16424 30.2583 5.06061 30.0136 5.04633C23.5436 4.67133 18.3486 6.63883 16.1161 10.3238C14.6411 12.7601 14.6436 15.7188 16.0961 18.5413C15.2694 19.5255 14.6652 20.6768 14.3249 21.9163L12.2911 19.8751C13.2686 17.8338 13.2311 15.7063 12.1661 13.9388C10.5161 11.2151 6.70737 9.75508 1.97862 10.0326C1.73398 10.0469 1.5031 10.1505 1.32982 10.3238C1.15653 10.4971 1.05291 10.7279 1.03862 10.9726C0.759874 15.7013 2.22112 19.5101 4.94487 21.1601C5.84371 21.7092 6.87656 21.9999 7.92987 22.0001C8.95225 21.9875 9.95872 21.7453 10.8749 21.2913L13.9999 24.4163V28.0001C13.9999 28.2653 14.1052 28.5196 14.2928 28.7072C14.4803 28.8947 14.7347 29.0001 14.9999 29.0001C15.2651 29.0001 15.5194 28.8947 15.707 28.7072C15.8945 28.5196 15.9999 28.2653 15.9999 28.0001V24.3138C15.9954 22.7229 16.5368 21.1787 17.5336 19.9388C18.8198 20.611 20.2463 20.9707 21.6974 20.9888C23.1003 20.9934 24.4773 20.6101 25.6761 19.8813C29.3611 17.6513 31.3336 12.4563 30.9536 5.98633ZM5.97612 19.4501C4.05862 18.2888 2.97362 15.5401 2.99987 12.0001C6.53987 11.9701 9.28862 13.0588 10.4499 14.9763C11.0561 15.9763 11.1549 17.1426 10.7574 18.3438L7.70612 15.2926C7.51706 15.113 7.26531 15.0143 7.00455 15.0176C6.74379 15.021 6.49465 15.126 6.31025 15.3104C6.12584 15.4948 6.02077 15.744 6.01744 16.0048C6.0141 16.2655 6.11275 16.5173 6.29237 16.7063L9.34362 19.7576C8.14237 20.1551 6.97738 20.0563 5.97612 19.4501ZM24.6399 18.1726C22.9649 19.1863 20.9961 19.2638 18.9961 18.4226L25.7074 11.7101C25.887 11.521 25.9857 11.2693 25.9823 11.0085C25.979 10.7477 25.8739 10.4986 25.6895 10.3142C25.5051 10.1298 25.256 10.0247 24.9952 10.0214C24.7344 10.018 24.4827 10.1167 24.2936 10.2963L17.5811 17.0001C16.7361 15.0001 16.8124 13.0301 17.8311 11.3563C19.5736 8.48133 23.7061 6.87883 28.9974 7.00258C29.1174 12.2926 27.5174 16.4301 24.6399 18.1726Z" fill="currentColor"/></svg>`,
  eaux: `<svg width="15" height="15" viewBox="0 0 32 32" fill="none"><path d="M21.75 5.96896C20.206 4.18575 18.4682 2.58002 16.5688 1.18146C16.4006 1.06367 16.2003 1.00049 15.995 1.00049C15.7897 1.00049 15.5894 1.06367 15.4213 1.18146C13.5253 2.58061 11.7909 4.18631 10.25 5.96896C6.81375 9.91521 5 14.0752 5 18.0002C5 20.9176 6.15893 23.7155 8.22183 25.7784C10.2847 27.8413 13.0826 29.0002 16 29.0002C18.9174 29.0002 21.7153 27.8413 23.7782 25.7784C25.8411 23.7155 27 20.9176 27 18.0002C27 14.0752 25.1863 9.91521 21.75 5.96896ZM16 27.0002C13.6139 26.9976 11.3262 26.0485 9.63896 24.3612C7.95171 22.674 7.00265 20.3863 7 18.0002C7 10.8465 13.9338 4.87521 16 3.25021C18.0662 4.87521 25 10.844 25 18.0002C24.9974 20.3863 24.0483 22.674 22.361 24.3612C20.6738 26.0485 18.3861 26.9976 16 27.0002ZM22.9862 19.1677C22.7269 20.6161 22.0301 21.9503 20.9896 22.9906C19.949 24.0309 18.6147 24.7275 17.1663 24.9865C17.1113 24.9953 17.0557 24.9999 17 25.0002C16.7492 25.0001 16.5075 24.9058 16.323 24.7359C16.1384 24.566 16.0245 24.333 16.0037 24.083C15.9829 23.833 16.0569 23.5844 16.2108 23.3863C16.3648 23.1883 16.5876 23.0554 16.835 23.014C18.9062 22.6652 20.6637 20.9077 21.015 18.8327C21.0594 18.5711 21.2059 18.3379 21.4223 18.1844C21.6387 18.0308 21.9072 17.9695 22.1688 18.014C22.4303 18.0584 22.6635 18.2049 22.8171 18.4213C22.9706 18.6376 23.0319 18.9061 22.9875 19.1677H22.9862Z" fill="currentColor"/></svg>`,
  site: `<svg width="15" height="15" viewBox="0 0 32 32" fill="none"><path d="M23 9.00022C23.0001 7.65842 22.6146 6.34486 21.8894 5.21595C21.1641 4.08705 20.1297 3.19037 18.9093 2.63271C17.6888 2.07505 16.3338 1.8799 15.0057 2.0705C13.6775 2.2611 12.432 2.82942 11.4177 3.70778C10.4033 4.58614 9.66282 5.73753 9.2843 7.02484C8.90578 8.31214 8.90522 9.6811 9.28269 10.9687C9.66016 12.2563 10.3997 13.4083 11.4134 14.2875C12.427 15.1667 13.672 15.736 15 15.9277V29.0002C15 29.2654 15.1054 29.5198 15.2929 29.7073C15.4804 29.8949 15.7348 30.0002 16 30.0002C16.2652 30.0002 16.5196 29.8949 16.7071 29.7073C16.8946 29.5198 17 29.2654 17 29.0002V15.9277C18.6649 15.6851 20.187 14.8518 21.2885 13.58C22.39 12.3082 22.9975 10.6827 23 9.00022ZM16 14.0002C15.0111 14.0002 14.0444 13.707 13.2221 13.1576C12.3999 12.6082 11.759 11.8273 11.3806 10.9136C11.0022 10 10.9031 8.99467 11.0961 8.02477C11.289 7.05486 11.7652 6.16395 12.4645 5.46469C13.1637 4.76542 14.0546 4.28922 15.0245 4.09629C15.9945 3.90337 16.9998 4.00238 17.9134 4.38082C18.827 4.75926 19.6079 5.40012 20.1573 6.22237C20.7068 7.04461 21 8.01131 21 9.00022C21 9.65683 20.8707 10.307 20.6194 10.9136C20.3681 11.5203 19.9998 12.0715 19.5355 12.5358C19.0712 13 18.52 13.3683 17.9134 13.6196C17.3068 13.8709 16.6566 14.0002 16 14.0002Z" fill="currentColor"/></svg>`,
  chevron: `<svg width="13" height="8" viewBox="0 0 12.7 7.06" fill="none"><path d="M0.35 0.35L6.35 6.35L12.35 0.35" stroke="white" stroke-opacity="0.45"/></svg>`,
  panel: `<svg width="16" height="13" viewBox="17 18.5 16 13" fill="none"><path d="M19 19H22.3662V31H19C18.1716 31 17.5 30.3284 17.5 29.5V20.5C17.5 19.6716 18.1716 19 19 19ZM31 19C31.8284 19 32.5 19.6716 32.5 20.5V29.5C32.5 30.3284 31.8284 31 31 31H23.3662V19H31Z" stroke="white"/></svg>`,
}

/* Contenu — wording-parcours.md (libellés) + composantes.md (aides) */
const SECTIONS = [
  {
    key: 'echelle', pill: 'Échelle de production', icon: 'echelle',
    question: 'Combien de poissons produisez-vous ?',
    options: [
      { id: 'locale', label: 'Échelle régionale ou locale : quelques tonnes par an', help: 'Un seul petit bassin/filet, faible densité de poissons.' },
      { id: 'nationale', label: 'Échelle nationale : quelques milliers de tonnes par an', help: 'Plusieurs bassins/filets, densité modérée.' },
      { id: 'continentale', label: 'Échelle continentale : plusieurs milliers de tonnes par an', help: 'Filets/bassins multiples occupant une large zone, très forte densité de poissons.' },
    ],
  },
  {
    key: 'methode', pill: "Méthode d'élevage", icon: 'elevage',
    question: 'Où et comment vivent vos poissons ?',
    options: [
      { id: 'cagesOuvertes', label: 'En pleine mer, dans des cages ouvertes', help: "Filets visibles en pleine eau, eau trouble autour des cages (particules de nourriture/déchets)." },
      { id: 'eauRejetee', label: "Sur terre, avec de l'eau puisée puis rejetée en continu", help: "Rejet visible en continu, légère baisse d'opacité près du point de rejet." },
      { id: 'eauBoucle', label: "Sur terre, avec de l'eau filtrée et réutilisée en boucle", help: "Peu d'effet visible dans le milieu ouvert, eau alentour presque inchangée." },
    ],
  },
  {
    key: 'alimentation', pill: 'Alimentation', icon: 'alimentation',
    question: 'Que mangent vos poissons ?',
    options: [
      { id: 'farine', label: 'Farine de poisson sauvage', help: 'Nourriture non consommée qui se dépose au fond, particules organiques visibles.' },
      { id: 'soja', label: 'Alimentation végétale (soja)', help: "Résidus qui enrichissent l'eau en nutriments, léger début de prolifération d'algues." },
      { id: 'insectes', label: "Alimentation à base d'insectes ou d'algues", help: 'Peu de résidus, eau et algues presque inchangées.' },
    ],
  },
  {
    key: 'eauxUsees', pill: 'État des eaux', icon: 'eaux',
    question: 'Où vont les eaux usées de votre exploitation ?',
    options: [
      { id: 'rejetDirect', label: 'Rejetée directement dans la nature', help: 'Eau qui se trouble et change de couleur, particules visibles.' },
      { id: 'traitee', label: 'Traitée, puis rejetée localement', help: "Légère baisse d'opacité, teinte presque inchangée." },
      { id: 'enfouie', label: 'Enfouie très profondément dans le sol', help: 'Eau de surface quasi inchangée localement.' },
    ],
  },
  {
    key: 'energie', pill: 'Fonctionnement du site', icon: 'site',
    question: 'De quoi votre site a-t-il besoin pour fonctionner ?',
    options: [
      { id: 'peuMachines', label: 'Peu de machines', help: 'Algues en bon état, pas de changement thermique visible.' },
      { id: 'continu', label: 'Des machines en fonctionnement continu', help: 'Algues légèrement affectées, début de prolifération.' },
      { id: 'artificiel', label: 'Un fonctionnement presque entièrement artificiel', help: "Prolifération ou dépérissement visible des algues, changement net de couleur de l'eau." },
    ],
  },
]

/* Cartes des fermes réelles — scores du barème composantes.md */
const PROFILE_CARDS = [
  { key: 'esturgeonniere', title: "L'Esturgeonnière", subtitle: 'Esturgeons · bassins à terre' },
  { key: 'frea', title: 'FREA', subtitle: 'Truites · circuit fermé' },
  { key: 'atlanticSapphire', title: 'Atlantic Sapphire', subtitle: 'Saumons · circuit fermé' },
]

/** Niveau (sens préservation) — seuils du wording : 70+ / 40-69 / <40. */
function tierLabel(score) {
  if (score >= 70) return 'Préservé'
  if (score >= 40) return 'Fragile'
  return 'Dégradé'
}

function presetScore(key) {
  return Object.entries(PRESETS[key].choices).reduce((sum, [componentKey, optionId]) =>
    sum + (window.NEMO.scenario.resolve({ [componentKey]: optionId }).score), 0)
}

export function mountConfigurator() {
  const scenario = window.NEMO.scenario
  document.body.classList.add('configurator-active')

  /* ---- panneau de configuration ---------------------------------- */
  const panel = document.createElement('aside')
  panel.id = 'cfg-panel'
  panel.className = 'cfg-surface'
  panel.setAttribute('aria-label', 'Configurateur d’exploitation aquacole')

  const sectionsHtml = SECTIONS.map((section) => `
    <hr class="cfg-separator">
    <section data-component="${section.key}">
      <span class="cfg-pill">${ICONS[section.icon]}${section.pill}</span>
      <h2 class="cfg-question">${section.question}</h2>
      <div class="cfg-options" role="radiogroup" aria-label="${section.question}">
        ${section.options.map((option) => `
          <button type="button" class="cfg-option" role="radio" aria-checked="false"
                  data-component="${section.key}" data-option="${option.id}">
            <span class="cfg-option-indicator">${ICONS.radio}</span>
            <span>
              <p class="cfg-option-label">${option.label}</p>
              <p class="cfg-option-help">${option.help}</p>
            </span>
          </button>`).join('')}
      </div>
    </section>`).join('')

  panel.innerHTML = `
    <h1 class="cfg-title">Composez votre exploitation</h1>
    <p class="cfg-subtitle">Chaque choix laisse une trace sous la surface. Composez la ferme, puis descendez voir ce qu'elle produit.</p>
    <hr class="cfg-separator">
    <section>
      <span class="cfg-pill">${ICONS.profils}Profils existants</span>
      <h2 class="cfg-question">Ou partez d'une ferme réelle</h2>
      <div class="cfg-profiles">
        ${PROFILE_CARDS.map((card) => `
          <button type="button" class="cfg-card" data-preset="${card.key}">
            <span>
              <p class="cfg-card-title">${card.title}</p>
              <p class="cfg-card-subtitle">${card.subtitle}</p>
            </span>
            <span>
              <span class="cfg-card-score" data-card-score></span>
              <span class="cfg-card-gauge" data-card-gauge>${'<span></span>'.repeat(5)}</span>
            </span>
          </button>`).join('')}
      </div>
    </section>
    ${sectionsHtml}
    <div class="cfg-actions">
      <button type="button" class="cfg-button secondary" data-action="reset">Réinitialiser mes choix</button>
      <button type="button" class="cfg-button primary" data-action="score">Consulter le score final</button>
    </div>`
  document.body.appendChild(panel)

  // scores réels des cartes profils — jauge Figma : paliers ATTEINTS en
  // dégradé croissant (18/32/50/72 %), non-atteints éteints (12 %)
  const CARD_STEPS = [0.18, 0.32, 0.5, 0.72]
  panel.querySelectorAll('.cfg-card').forEach((card) => {
    const score = presetScore(card.dataset.preset)
    card.querySelector('[data-card-score]').innerHTML =
      `${score}<small>/100 · ${tierLabel(score)}</small>`
    const reached = Math.max(1, Math.ceil(score / 20))
    card.querySelectorAll('[data-card-gauge] span').forEach((segment, i) => {
      // dégradé réparti sur les paliers atteints, culminant à 72 %
      const t = reached > 1 ? i / (reached - 1) : 1
      segment.style.backgroundColor = i < reached
        ? `rgba(255,255,255,${(CARD_STEPS[0] + t * (0.72 - CARD_STEPS[0])).toFixed(2)})`
        : 'rgba(255,255,255,0.12)'
    })
  })

  /* ---- panneau impact --------------------------------------------- */
  const impact = document.createElement('aside')
  impact.id = 'impact-panel'
  impact.className = 'cfg-surface is-collapsed'
  impact.innerHTML = `
    <button type="button" class="impact-header" aria-expanded="false">
      <span class="impact-header-left">
        <span class="impact-chevron">${ICONS.chevron}</span>
        <span class="cfg-overline">État estimé de l'écosystème</span>
      </span>
      <span class="impact-mini-score"><span class="odo" data-mini-score>—</span><small>/100</small></span>
    </button>
    <div class="impact-body">
      <div class="impact-score-row">
        <span class="impact-score"><span class="odo" data-score>—</span><small>/100</small></span>
        <span class="impact-tier" data-tier></span>
      </div>
      <div class="impact-gauge">${'<span></span>'.repeat(5)}</div>
      <div class="impact-scale"><span>0</span><span>20</span><span>40</span><span>60</span><span>80</span><span>100</span></div>
      <div class="impact-detail-header">
        <span class="cfg-overline">Détail de la notation</span>
        <span class="right">pondéré sur 100</span>
      </div>
      <div data-criteria>
        ${projectCriteria({}).map((criterion) => `
          <div class="impact-line" data-criterion="${criterion.key}">
            <div class="impact-line-row">
              <span>${criterion.label}</span>
              <span class="value">0/${criterion.max}</span>
            </div>
            <div class="impact-line-track">
              <div class="impact-line-fill" style="width:0%"></div>
            </div>
          </div>`).join('')}
      </div>
    </div>`
  document.body.appendChild(impact)

  /** Odomètre façon réveil : une colonne 0-9 par chiffre, qui roule. */
  function odometer(container, value) {
    if (value === null) { container.textContent = '—'; container._odo = null; return }
    const digits = String(value).split('')
    if (!container._odo || container._odo.length !== digits.length) {
      container.innerHTML = digits.map(() =>
        `<span class="odo-digit"><span class="odo-reel">0123456789</span></span>`).join('')
      container._odo = [...container.querySelectorAll('.odo-reel')]
      // colonne par chiffre : "0123456789" empilé par le CSS (letter par ligne)
      container._odo.forEach((reel) => { reel.innerHTML = '0123456789'.split('').map((d) => `<i>${d}</i>`).join('') })
    }
    container._odo.forEach((reel, i) => {
      // crans de 1.7em, fenêtre de 1.3em (voir CSS) : les chiffres Playfair
      // (chasses hautes du 5, jambages du 3/4/9) tiennent entiers dans la fenêtre
      reel.style.transform = `translateY(${(-Number(digits[i]) * 1.7 - 0.2).toFixed(2)}em)`
    })
  }

  const header = impact.querySelector('.impact-header')
  const setCollapsed = (collapsed) => {
    impact.classList.toggle('is-collapsed', collapsed)
    header.setAttribute('aria-expanded', String(!collapsed))
  }
  header.addEventListener('click', () => setCollapsed(!impact.classList.contains('is-collapsed')))

  /* ---- écran G : barre haute (maquette « screen G ») ---------------- */
  const gbar = document.createElement('div')
  gbar.id = 'gbar'
  gbar.innerHTML = `
    <button type="button" class="gbar-btn gbar-icon cfg-surface" data-action="back-config"
            aria-label="Rouvrir le configurateur" title="Rouvrir le configurateur">${ICONS.panel}</button>
    <button type="button" class="gbar-btn gbar-conclude cfg-surface" data-action="conclude">Conclure l'expérience →</button>`
  document.body.appendChild(gbar)

  /* ---- écran H-1 : voile d'appel à l'action (maquette « screen H-1 »).
     Boutons factices pour l'instant (décision Romain), les vraies URLs
     seront branchées plus tard. -------------------------------------- */
  const veil = document.createElement('div')
  veil.id = 'cta-veil'
  veil.setAttribute('role', 'dialog')
  veil.setAttribute('aria-label', 'Conclusion de l’expérience')
  veil.innerHTML = `
    <p class="cta-title">Votre voix compte afin d'aider Seastemik à imposer un cadre plus strict.</p>
    <div class="cta-actions">
      <button type="button" class="cta-btn cfg-surface" data-action="petition">Signer la pétition</button>
      <button type="button" class="cta-btn cfg-surface" data-action="inform">Continuer à m'informer</button>
    </div>`
  document.body.appendChild(veil)

  /** Machine d'écrans : F (config) → G (résultat) → H-1 (cta). */
  const setScreen = (name) => {
    document.body.classList.toggle('screen-result', name !== 'config')
    document.body.classList.toggle('screen-cta', name === 'cta')
    // en G le module Impact arrive DÉPLIÉ (retour Romain) ; au retour en F
    // il redevient le pill discret en bas à droite
    if (name === 'result') setCollapsed(false)
    if (name === 'config') setCollapsed(true)
  }
  gbar.addEventListener('click', (event) => {
    const action = event.target.closest('[data-action]')?.dataset.action
    if (action === 'back-config') setScreen('config')
    if (action === 'conclude') setScreen('cta')
  })
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && document.body.classList.contains('screen-cta')) setScreen('result')
  })

  /* ---- état + rendu (DOM stable : les barres GLISSENT, rien n'est
     reconstruit — condition des animations demandées) ----------------- */
  const scoreBox = impact.querySelector('[data-score]')
  const miniBox = impact.querySelector('[data-mini-score]')
  const gaugeSegments = [...impact.querySelectorAll('.impact-gauge span')]
  const criteriaLines = new Map([...impact.querySelectorAll('[data-criterion]')]
    .map((line) => [line.dataset.criterion, line]))
  // dégradé de FOND de la jauge, du plus sombre au plus clair (Figma) ;
  // le palier courant est boosté à 72 % + contour blanc
  const GAUGE_BASE = [0.08, 0.14, 0.22, 0.31, 0.45]
  let previousCriteria = new Map(projectCriteria({}).map((c) => [c.key, c.value]))
  const hotTimers = new Map()

  function render() {
    const choices = scenario.choices
    const done = Object.keys(choices).length
    const score = scenario.score

    // options + cartes
    panel.querySelectorAll('.cfg-option').forEach((option) => {
      const selected = choices[option.dataset.component] === option.dataset.option
      option.classList.toggle('is-selected', selected)
      option.setAttribute('aria-checked', String(selected))
    })
    const activePreset = Object.entries(PRESETS).find(([, preset]) =>
      Object.entries(preset.choices).every(([k, v]) => choices[k] === v))?.[0]
    panel.querySelectorAll('.cfg-card').forEach((card) =>
      card.classList.toggle('is-selected', card.dataset.preset === activePreset))

    // score en odomètre (— tant qu'aucun choix)
    odometer(scoreBox, done ? score : null)
    odometer(miniBox, done ? score : null)
    impact.querySelector('[data-tier]').textContent = done === 5 ? tierLabel(score) : done ? '…' : ''

    // jauge : dégradé de fond, palier courant contouré et boosté
    const currentStep = done ? Math.min(4, Math.floor(score / 20)) : -1
    gaugeSegments.forEach((segment, i) => {
      const isCurrent = i === currentStep
      segment.classList.toggle('active', isCurrent)
      segment.style.backgroundColor = `rgba(255,255,255,${isCurrent ? 0.72 : GAUGE_BASE[i]})`
    })

    // détail : mise à jour EN PLACE — la barre glisse, la ligne modifiée
    // s'illumine brièvement (highlight demandé)
    for (const criterion of projectCriteria(choices)) {
      const line = criteriaLines.get(criterion.key)
      line.querySelector('.value').textContent = `${criterion.value}/${criterion.max}`
      line.querySelector('.impact-line-fill').style.width =
        `${(criterion.value / criterion.max) * 100}%`
      if (previousCriteria.get(criterion.key) !== criterion.value) {
        line.classList.add('is-hot')
        clearTimeout(hotTimers.get(criterion.key))
        hotTimers.set(criterion.key, setTimeout(() => line.classList.remove('is-hot'), 1500))
      }
      previousCriteria.set(criterion.key, criterion.value)
    }
  }

  /* ---- interactions ------------------------------------------------ */
  panel.addEventListener('click', (event) => {
    const option = event.target.closest('.cfg-option')
    if (option) {
      scenario.set({ [option.dataset.component]: option.dataset.option })
      render()
      return
    }
    const card = event.target.closest('.cfg-card')
    if (card) {
      // re-clic sur le préréglage actif : désélection = remise à zéro
      if (card.classList.contains('is-selected')) {
        scenario.reset()
      } else {
        scenario.preset(card.dataset.preset)
        scenario.set({ species: PRESETS[card.dataset.preset].species })
      }
      render()
      return
    }
    const action = event.target.closest('[data-action]')
    if (action?.dataset.action === 'reset') {
      scenario.reset()
      render()
    }
    if (action?.dataset.action === 'score') setScreen('result')
  })

  render()
  window.NEMO.setScreen = setScreen
  return { render, setScreen }
}
