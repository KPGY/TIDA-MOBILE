import React, { ReactNode } from 'react';
import { View, Image, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { SafeAreaView, Edge } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
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
  const { bgTheme, bgThemeEnd, gradientMode, bgAttachmentPath, bgOpacity } = useAppStore();

  return (
    <View style={styles.container}>
      {gradientMode ? (
        <LinearGradient
          colors={[bgTheme, bgThemeEnd || bgTheme]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: bgTheme }]} />
      )}

      {bgAttachmentPath ? (
        <>
          <Image
            source={{ uri: bgAttachmentPath }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
          />
          {gradientMode ? (
            <LinearGradient
              colors={[bgTheme, bgThemeEnd || bgTheme]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[
                StyleSheet.absoluteFill,
                { opacity: bgOpacity ?? 0.45 },
              ]}
            />
          ) : (
            <View
              style={[
                StyleSheet.absoluteFill,
                {
                  backgroundColor: bgTheme,
                  opacity: bgOpacity ?? 0.45,
                },
              ]}
            />
          )}
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
