// PressBtn — minimal shared pressable with uniform press feedback
// (scale 0.97 + dim, UX audit 2026-06-11: SIGN IN gave zero feedback).
// Drop-in for Pressable when `style` is a plain object/array (not a function).
import React from 'react';
import { Pressable } from 'react-native';

export default function PressBtn({ style, disabled, ...rest }) {
  return (
    <Pressable disabled={disabled} {...rest}
      style={({ pressed }) => [
        ...(Array.isArray(style) ? style : [style]),
        pressed && !disabled ? { transform: [{ scale: 0.97 }], opacity: 0.82 } : null,
      ]} />
  );
}
