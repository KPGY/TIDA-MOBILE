import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

// 브라우저 리다이렉트 세션 완료 처리
WebBrowser.maybeCompleteAuthSession();

export default function OAuthRedirectScreen() {
  const router = useRouter();

  useEffect(() => {
    // 모바일 로그인 후 앱 설정 화면으로 즉시 복귀
    router.replace('/(tabs)/setting');
  }, [router]);

  return <View style={styles.container} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
});
