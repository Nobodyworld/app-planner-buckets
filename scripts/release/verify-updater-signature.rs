use minisign_verify::{PublicKey, Signature};
use std::{env, fs, path::Path};

fn main() {
    let mut args = env::args().skip(1);
    let artifact_path = args
        .next()
        .expect("usage: verify-updater-signature <artifact> <signature> <public-key-file>");
    let signature_path = args
        .next()
        .expect("usage: verify-updater-signature <artifact> <signature> <public-key-file>");
    let public_key_path = args
        .next()
        .expect("usage: verify-updater-signature <artifact> <signature> <public-key-file>");
    if args.next().is_some() {
        panic!("usage: verify-updater-signature <artifact> <signature> <public-key-file>");
    }

    let public_key = PublicKey::from_file(Path::new(&public_key_path))
        .expect("unable to decode updater public key");
    let signature = Signature::from_file(Path::new(&signature_path))
        .expect("unable to decode updater signature");
    let bytes = fs::read(&artifact_path).expect("unable to read updater artifact");

    if bytes.is_empty() {
        panic!("updater artifact must not be empty");
    }

    public_key
        .verify(&bytes, &signature, false)
        .expect("updater signature did not verify");

    let mut tampered = bytes;
    let index = tampered.len() / 2;
    tampered[index] ^= 0x01;
    if public_key.verify(&tampered, &signature, false).is_ok() {
        panic!("tampered updater artifact unexpectedly verified");
    }

    println!("Updater signature verification PASS; tampered artifact rejected.");
}
