import { useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { IconEye } from "./Icons";

export default function PasswordInput({ style, visibilityLabel = "mật khẩu", ...props }) {
  const [visible, setVisible] = useState(false);

  return (
    <View style={styles.container}>
      <TextInput {...props} style={[style, styles.input]} secureTextEntry={!visible} autoCorrect={false} spellCheck={false} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${visible ? "Ẩn" : "Hiện"} ${visibilityLabel}`}
        accessibilityState={{ selected: visible }}
        onPress={() => setVisible((current) => !current)}
        style={styles.toggle}
      >
        <IconEye crossedOut={visible} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { position: "relative" },
  input: { paddingRight: 54 },
  toggle: { position: "absolute", top: 0, right: 4, bottom: 10, minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
});
