// Centralized react-icons re-exports.
//
// react-icons v5 types IconType as returning React.ReactNode, which this repo's
// pinned TypeScript 4.9 rejects as a JSX component (TS2786). Casting each icon to
// a plain SVG component type here lets the rest of the app use them as normal
// JSX (<FaBox />) without repeating the cast at every call site.
import React from 'react';
import * as Fa from 'react-icons/fa6';

type SvgIcon = React.FC<React.SVGProps<SVGSVGElement>>;
const asIcon = (icon: unknown): SvgIcon => icon as SvgIcon;

export const FaBox = asIcon(Fa.FaBox);
export const FaGear = asIcon(Fa.FaGear);
export const FaDesktop = asIcon(Fa.FaDesktop);
export const FaMicrochip = asIcon(Fa.FaMicrochip);
export const FaWrench = asIcon(Fa.FaWrench);
export const FaCode = asIcon(Fa.FaCode);
export const FaHashtag = asIcon(Fa.FaHashtag);
export const FaFingerprint = asIcon(Fa.FaFingerprint);
export const FaTags = asIcon(Fa.FaTags);
export const FaArrowLeft = asIcon(Fa.FaArrowLeft);
export const FaArrowRight = asIcon(Fa.FaArrowRight);
export const FaClipboardList = asIcon(Fa.FaClipboardList);
export const FaAlignLeft = asIcon(Fa.FaAlignLeft);
export const FaCircleInfo = asIcon(Fa.FaCircleInfo);
export const FaCubes = asIcon(Fa.FaCubes);
export const FaSliders = asIcon(Fa.FaSliders);
export const FaFolder = asIcon(Fa.FaFolder);
export const FaMagnifyingGlass = asIcon(Fa.FaMagnifyingGlass);
export const FaXmark = asIcon(Fa.FaXmark);
export const FaCheck = asIcon(Fa.FaCheck);
export const FaCircleCheck = asIcon(Fa.FaCircleCheck);
export const FaCircleStop = asIcon(Fa.FaCircleStop);
export const FaTriangleExclamation = asIcon(Fa.FaTriangleExclamation);
