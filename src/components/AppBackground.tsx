import React, { ReactNode } from 'react';
import { View, Image, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { SafeAreaView, Edge } from 'react-native-safe-area-context';
import { useAppStore } from '@/store/store';

interface AppBackgroundProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  edges?: Edge[];
}

export function AppBackground({
  children,
  style,
  edges = ['top', 'left', 'right'],
}: AppBackgroundProps) {
  const { bgTheme, bgAttachmentPath, bgOpacity } = useAppStore();

  return (
    <View style={[styles.container, { backgroundColor: bgTheme }]}>
      {bgAttachmentPath ? (
        <>
          <Image
            source={{ uri: bgAttachmentPath }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
          />
          <View
            style={[
              StyleSheet.absoluteFill,
              {
                backgroundColor: bgTheme,
                opacity: bgOpacity ?? 0.45,
              },
            ]}
          />
        </>
      ) : null}
      <SafeAreaView style={[styles.safeArea, style]} edges={edges}>
        {children}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
});
