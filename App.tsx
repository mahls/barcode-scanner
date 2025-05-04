import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, Clipboard, Alert } from 'react-native';
import { CameraView, useCameraPermissions, CameraType } from 'expo-camera';
import { Audio } from 'expo-av';
import { Asset } from 'expo-asset';
import Animated, {
  useSharedValue,
  withTiming,
  useAnimatedStyle,
  runOnJS,
} from 'react-native-reanimated';

// --- AnimatedListItem component ---
const AnimatedListItem = ({ item, onDelete, onCopy }: {
  item: string;
  onDelete: () => void;
  onCopy: () => void;
}) => {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(20);
  const height = useSharedValue(70); // approximate item height

  // Entry animation
  useEffect(() => {
    opacity.value = withTiming(1, { duration: 300 });
    translateY.value = withTiming(0, { duration: 300 });
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
    height: height.value,
  }));

  return (
    <Animated.View style={[styles.listItemContainer, animatedStyle]}>
      <Text style={styles.listItemText}>{item}</Text>
      <View style={styles.buttonRow}>
        <TouchableOpacity onPress={onCopy} style={styles.copyButton}>
          <Text style={styles.copyButtonText}>Copy</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onDelete} style={styles.deleteButton}>
          <Text style={styles.deleteButtonText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
};

// --- Main App component ---
export default function App() {
  const [facing, setFacing] = useState<CameraType>('back');
  const [permission, requestPermission] = useCameraPermissions();
  const [scannedData, setScannedData] = useState<string | null>(null);
  const [scannedList, setScannedList] = useState<string[]>([]);
  const [scanned, setScanned] = useState(false);
  const lastScannedTimestampRef = useRef(0);
  const [zoom, setZoom] = useState(0.9);
  const [soundObject, setSoundObject] = useState<Audio.Sound | null>(null);

  useEffect(() => {
    if (permission?.granted === false) {
      requestPermission();
    }

    async function loadSound() {
      try {
        const asset = Asset.fromModule(require('./assets/beep-08b.mp3'));
        await asset.downloadAsync();
        const { sound } = await Audio.Sound.createAsync({ uri: asset.uri });
        setSoundObject(sound);
      } catch (error) {
        console.warn('Error loading sound:', error);
      }
    }

    loadSound();

    return () => {
      if (soundObject) {
        soundObject.unloadAsync();
      }
    };
  }, [permission]);

  const handleBarcodeScanned = async (result: any) => {
    const timestamp = Date.now();
    if (scanned || (timestamp - lastScannedTimestampRef.current < 1000)) return;

    lastScannedTimestampRef.current = timestamp;
    setScanned(true);
    setScannedList((prevList) => [...prevList, result.data]);
    setScannedData(null);

    if (soundObject) {
      try {
        await soundObject.replayAsync();
      } catch (error) {
        console.warn('Error playing sound:', error);
      }
    } else {
      console.warn('Sound object not loaded yet.');
    }

    setTimeout(() => {
      setScanned(false);
    }, 500);
  };

  const handleCopyToClipboard = () => {
    if (scannedList.length > 0) {
      const listString = scannedList.join('\n');
      Clipboard.setString(listString);
    }
  };

  const handleCopySingleBarcode = (barcode: string) => {
    Clipboard.setString(barcode);
  };

  const handleDeleteBarcode = (index: number) => {
    const itemToDelete = scannedList[index];
    Alert.alert(
      'Confirm Delete',
      `Are you sure you want to delete "${itemToDelete}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            setScannedList((prevList) => prevList.filter((_, i) => i !== index));
          },
        },
      ]
    );
  };

  const handleRemoveDuplicates = () => {
    const counts: { [key: string]: number } = {};
    scannedList.forEach((item) => {
      counts[item] = (counts[item] || 0) + 1;
    });

    const duplicates = Object.entries(counts)
      .filter(([, count]) => count > 1)
      .map(([barcode, count]) => `${barcode} (x${count})`)
      .join('\n');

    if (duplicates) {
      Alert.alert(
        'Confirm Remove Duplicates',
        `Duplicates found:\n${duplicates}\n\nRemove them?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: () => {
              setScannedList((prevList) => [...new Set(prevList)]);
            },
          },
        ]
      );
    } else {
      Alert.alert('No Duplicates', 'No duplicate barcodes found.', [{ text: 'OK' }]);
    }
  };

  const handleRemoveAll = () => {
    Alert.alert('Confirm Remove All', 'Are you sure you want to delete all items?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove All',
        style: 'destructive',
        onPress: () => {
          setScannedList([]); // Clear all items from the list
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.cameraContainer}>
        <CameraView
          style={styles.camera}
          facing={facing}
          barcodeScannerSettings={{
            barcodeTypes: [
              'aztec', 'code128', 'code39', 'code93', 'codabar',
              'data_matrix', 'ean13', 'ean8', 'itf14', 'pdf417',
              'qr', 'upc_a', 'upc_e',
            ],
            isHighlightingEnabled: true,
          }}
          zoom={zoom}
          onBarcodeScanned={handleBarcodeScanned}
        />
      </View>

      <ScrollView style={styles.listContainer}>
        {scannedList.length > 0 ? (
          scannedList.map((item, index) => (
            <AnimatedListItem
              key={`${item}-${index}`}
              item={item}
              onCopy={() => handleCopySingleBarcode(item)}
              onDelete={() => handleDeleteBarcode(index)}
            />
          ))
        ) : (
          <View style={styles.emptyListMessage}>
            <Text style={styles.noCodesScannedText}>No barcodes scanned</Text>
          </View>
        )}
      </ScrollView>

      <View style={styles.buttonContainer}>
        <TouchableOpacity style={styles.button} onPress={handleRemoveDuplicates}>
          <Text style={styles.buttonText}>Dedupe</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.button} onPress={handleRemoveAll}>
          <Text style={styles.buttonText}>Clear</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.button} onPress={handleCopyToClipboard}>
          <Text style={styles.buttonText}>Copy</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// --- Styles ---
const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'flex-start',
    alignItems: 'center',
    padding: 20,
    backgroundColor: 'white',
  },
  cameraContainer: {
    width: '100%',
    height: 150,
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 20,
    marginTop: 30,
  },
  camera: {
    flex: 1,
    width: '100%',
  },
  listContainer: {
    marginTop: 20,
    width: '100%',
    flexGrow: 1,
    marginBottom: 70,
  },
  listItemContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 0.5,
    borderColor: 'lightgray',
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  listItemText: {
    flex: 1,
    fontSize: 16,
    color: 'black',
    marginRight: 10,
  },
  buttonRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  copyButton: {
    backgroundColor: 'white',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 5,
    borderWidth: 1,
    marginRight: 10,
    borderColor: 'black',
  },
  copyButtonText: {
    color: 'black',
    fontSize: 14,
  },
  deleteButton: {
    backgroundColor: 'white',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 5,
    borderColor: 'red',
    borderWidth: 1,
  },
  deleteButtonText: {
    color: 'red',
    fontSize: 14,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    position: 'absolute',
    bottom: 30,
    paddingHorizontal: 0,
  },
  button: {
    paddingVertical: 5,
    paddingHorizontal: 2,
    backgroundColor: '#2b2b2b',
    borderRadius: 5,
    flex: 1,
    marginHorizontal: 2,
    justifyContent: 'center',
    alignItems: 'center',
    fontSize: 100,
  },
  buttonText: {
    color: 'white',
    fontSize: 22,
    textAlign: 'center',
  },
  emptyListMessage: {
    justifyContent: 'center',
    alignItems: 'center',
    height: 100,
  },
  noCodesScannedText: {
    color: 'black',
    fontSize: 35,
    textAlign: 'center',
  },
  
});
