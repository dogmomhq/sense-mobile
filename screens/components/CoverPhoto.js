// Replicates CSS `background: url(..) no-repeat center top / cover` exactly:
// scale the image so it covers the box, center it horizontally, pin the TOP
// edge (plain RN resizeMode:'cover' centers vertically, which crops the
// cheetah's eyes differently than the locked prototype).
import React from 'react';
import { View, Image } from 'react-native';

export default function CoverPhoto({ source, naturalW, naturalH, boxW, boxH, style }) {
  const k = Math.max(boxW / naturalW, boxH / naturalH);
  const w = naturalW * k, h = naturalH * k;
  return (
    <View style={[{ width: boxW, height: boxH, overflow: 'hidden' }, style]}>
      <Image
        source={source}
        style={{ position: 'absolute', top: 0, left: (boxW - w) / 2, width: w, height: h }}
        fadeDuration={0}
      />
    </View>
  );
}
