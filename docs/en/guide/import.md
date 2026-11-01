# Import from Google Photos & Google Drive

Instead of downloading photos to your phone and uploading them again, you can import them directly from **Google Photos** or **Google Drive**.

::: info Available only if the operator set it up
The import buttons appear only when the operator configured the Google integration ([operator guide](../operator/photo-sources)).
:::

## Why photos are copied

Wayfare **copies** the selected photos into its own storage instead of linking to them. This is deliberate (see [ADR 0003](https://github.com/nullthrone/wayfare/blob/main/docs/adr/0003-import-not-link.md)):

- Google only gives apps temporary access to the photos you select; the picture links expire after about an hour. Live linking is technically impossible.
- Your album keeps working even if you later disconnect Google, delete the original or change your Google account.
- Download protection and watermarks work exactly the same for imported photos.

The flip side: imported photos use storage space on the Wayfare server, and new photos you add to a Google album later are **not** synced automatically — import them again.

## Google Photos flow

1. In your album choose **Import → Google Photos**.
2. The first time, you sign in with Google and grant access ("Connect"). Wayfare only gets the permission to read the photos *you pick*.
3. A Google window opens (the **Picker**). Select the photos or albums you want and confirm.
4. Return to Wayfare — it notices that you are done and shows how many photos were selected.
5. Wayfare downloads them in batches of up to 10 and shows progress. Duplicates are skipped.

## Google Drive flow

1. Choose **Import → Google Drive** and connect your account once.
2. The Google Drive file picker opens inside the page. Select image files.
3. Confirm — Wayfare imports them in batches, just like above.

Wayfare only gets access to the files you explicitly pick (the `drive.file` permission), never your whole Drive.

## Disconnecting

You can disconnect Google at any time in the import dialog. Stored tokens are deleted. Photos already imported stay in your album.
